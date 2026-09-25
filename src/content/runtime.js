(() => {
  "use strict";

  const Memosaic = globalThis.Memosaic;
  const protocol = Memosaic?.protocol;
  const i18n = Memosaic?.i18n;
  const adapter = Memosaic?.adapters?.findForHost(location.hostname);
  if (!adapter) return;

  const previousText = new WeakMap();
  const textChangedAt = new WeakMap();
  const handledResponses = new WeakSet();
  const STABLE_SCAN_TICKS = 3;
  let scanTick = 0;
  let currentLocale = i18n.normalizeLocale("auto");
  let turnIsActive = false;
  let hasBootstrapped = false;
  let currentConversationKey = conversationKey();
  let lastSubmitAt = 0;
  let scanTimer;

  try {
    chrome.storage.local.get({ language: "auto" }, ({ language }) => {
      currentLocale = i18n.normalizeLocale(language);
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.language) {
        currentLocale = i18n.normalizeLocale(changes.language.newValue);
      }
    });
  } catch {
    currentLocale = i18n.normalizeLocale("auto");
  }

  function conversationKey() {
    try {
      return adapter.conversationKey(location) || null;
    } catch {
      return null;
    }
  }

  function bootstrapStorageKey() {
    const key = conversationKey();
    return key ? `memosaic-bootstrap:v3:${adapter.id}:${key}` : null;
  }

  function restoreConversationState() {
    const key = bootstrapStorageKey();
    if (!key) {
      hasBootstrapped = false;
      return;
    }
    try {
      hasBootstrapped = sessionStorage.getItem(key) === "1";
    } catch {
      hasBootstrapped = false;
    }
  }

  restoreConversationState();

  function visible(element) {
    return !!element &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden" &&
      getComputedStyle(element).display !== "none";
  }

  function getComposer() {
    const fields = Array.from(document.querySelectorAll(adapter.composerSelectors.join(",")))
      .filter(visible);
    const preferred = fields.find((field) => {
      const placeholder = `${field.getAttribute("placeholder") || ""} ${field.getAttribute("aria-label") || ""}`;
      return (adapter.placeholderPatterns || []).some((pattern) => pattern.test(placeholder));
    });
    return preferred || fields.find((field) => field.tagName === "TEXTAREA") || fields.at(-1) || null;
  }

  function getValue(field) {
    return field.isContentEditable ? (field.innerText || field.textContent || "") : field.value;
  }

  function setValue(field, value) {
    if (field.isContentEditable) {
      field.focus();
      field.textContent = value;
    } else {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(field, value);
      else field.value = value;
    }
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function saveBootstrapState() {
    const key = bootstrapStorageKey();
    if (!key) return;
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // Session storage is optional.
    }
  }

  function resetForNewConversation() {
    hasBootstrapped = false;
    turnIsActive = false;
    lastSubmitAt = 0;
    const key = bootstrapStorageKey();
    if (key) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Session storage is optional.
      }
    }
  }

  function elementLabel(element) {
    return [
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-testid") || "",
      element.className && typeof element.className === "string" ? element.className : "",
      element.innerText || ""
    ].join(" ");
  }

  function isDisabled(element) {
    return element.disabled ||
      element.getAttribute("aria-disabled") === "true" ||
      /disabled|cursor-not-allowed/.test(element.className && typeof element.className === "string" ? element.className : "");
  }

  function findControls(selectors, field) {
    const selector = [...selectors, "button", "[role='button']"].join(",");

    let ancestor = field;
    for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
      const controls = Array.from(ancestor.querySelectorAll(selector)).filter(visible);
      if (controls.length) return controls;
    }
    return [];
  }

  function findSendButton(field) {
    const controls = findControls(adapter.sendButtonSelectors || [], field);
    const enabled = controls.filter((control) => !isDisabled(control));

    const sendMatches = enabled.filter((control) => adapter.sendButtonLabels?.test(elementLabel(control)));
    // A provider renders its send and stop controls in the same slot. When both
    // are labeled, the send button is the shorter label; a stop label such as
    // "Stop response" also ends with the word "response", so a substring test is
    // not enough to tell them apart.
    if (sendMatches.length) {
      return sendMatches.slice().sort((first, second) => elementLabel(first).length - elementLabel(second).length)[0];
    }

    const unlabeled = enabled.filter((control) => !adapter.stopButtonLabels?.test(elementLabel(control)));
    if (unlabeled.length >= 2) return unlabeled.at(-1);
    return null;
  }

  function findStopControl(field) {
    if (!adapter.stopButtonLabels) return null;
    let ancestor = field;
    for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
      const control = Array.from(ancestor.querySelectorAll("button,[role='button']"))
        .find((candidate) => visible(candidate) && !isDisabled(candidate) && adapter.stopButtonLabels.test(elementLabel(candidate)));
      if (control) return control;
    }
    return null;
  }

  // The tool result must only replace an idle composer. Sending it while the
  // model is still generating stops that answer, which the provider surfaces as
  // a stopped response ("你已让系统停止这条回答" on Gemini), and it can cut the
  // tool call in half.
  function canSendNow(field) {
    if (!field || getValue(field).trim() !== "") return false;
    if (!adapter.sendButtonLabels) return true;
    return findControls(adapter.sendButtonSelectors || [], field).some((control) => (
      adapter.sendButtonLabels.test(elementLabel(control))
        && !adapter.stopButtonLabels?.test(elementLabel(control))
    ));
  }

  function dispatchEnter(field) {
    field.focus();
    for (const type of ["keydown", "keypress", "keyup"]) {
      field.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function sendText(text) {
    const field = getComposer();
    if (!field) return false;

    // Wait for an idle turn: an empty composer with no active stop control.
    for (let wait = 0; wait < 25 && !canSendNow(field); wait += 1) {
      await delay(120);
    }

    setValue(field, text);
    if (findStopControl(field)) {
      setValue(field, "");
      return false;
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await delay(attempt === 0 ? 40 : 80);
      if (findStopControl(field)) continue;
      const button = findSendButton(field);
      if (!button) continue;
      button.click();
      await delay(180);
      if (getValue(field).trim() === "") return true;
    }

    if (adapter.sendFallback === "enter" && !findStopControl(field)) {
      dispatchEnter(field);
      await delay(220);
      return true;
    }
    setValue(field, "");
    return false;
  }

  function isUserMessage(element) {
    if (typeof adapter.isUserMessage === "function") return adapter.isUserMessage(element);
    const selectors = adapter.userMessageSelectors || [];
    return selectors.length > 0 && !!element.closest(selectors.join(","));
  }

  function currentResponseCandidates() {
    const root = document.querySelector("main,[role='main']") || document.body;
    const elements = new Set(Array.from(root.querySelectorAll(adapter.responseSelectors.join(","))));
    return Array.from(elements).filter((element) => {
      if (!visible(element) || isUserMessage(element)) return false;
      if (typeof adapter.isResponseElement === "function" && !adapter.isResponseElement(element)) return false;
      return true;
    });
  }

  function normalizedText(element) {
    if (typeof adapter.getResponseText === "function") {
      return protocol.cleanText(adapter.getResponseText(element));
    }

    // A provider response element can contain chrome in addition to the reply:
    // a reasoning block, an action toolbar whose icon font renders as text, or
    // a collapsed summary. Prefer the declared reply body so the tool wrapper
    // is read without that noise.
    for (const selector of adapter.responseTextSelectors || []) {
      for (const nested of element.querySelectorAll(selector)) {
        const text = protocol.cleanText(nested.innerText || nested.textContent);
        if (text) return text;
      }
    }

    const container = protocol.cleanText(element.innerText || element.textContent);
    if (container) return container;

    // The reply body was declared but rendered empty. Read the container so the
    // streamed text can still be detected on the next scan.
    for (const selector of adapter.responseTextSelectors || []) {
      const nested = element.querySelector(selector);
      if (nested) return protocol.cleanText(nested.textContent);
    }

    return "";
  }

  function snapshotResponses() {
    for (const element of currentResponseCandidates()) {
      snapshotElement(element);
    }
  }

  function snapshotElement(element) {
    previousText.set(element, normalizedText(element));
    textChangedAt.set(element, scanTick);
  }

  function markSubmitted() {
    lastSubmitAt = Date.now();
    turnIsActive = true;
    snapshotResponses();
  }

  function prepareFirstMessage(field) {
    const original = getValue(field);
    if (!original.trim()) return false;
    if (!hasBootstrapped) {
      const bootstrap = protocol.createBootstrap(currentLocale);
      const requestLabel = i18n.translate(currentLocale, "prompt.requestLabel");
      setValue(field, `${bootstrap}\n\n${requestLabel}\n${original}`);
      hasBootstrapped = true;
      saveBootstrapState();
      showToast(i18n.translate(currentLocale, "toast.ready"));
    }
    markSubmitted();
    return true;
  }

  function isNewChatControl(element) {
    const control = element?.closest("button,[role='button']");
    if (!control) return false;
    return adapter.newChatPattern?.test(elementLabel(control)) || false;
  }

  document.addEventListener("click", (event) => {
    if (isNewChatControl(event.target)) {
      resetForNewConversation();
      return;
    }
    const field = getComposer();
    if (!field) return;
    const button = findSendButton(field);
    if (button && (event.target === button || button.contains(event.target))) prepareFirstMessage(field);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const field = getComposer();
    if (!field || event.target !== field) return;
    prepareFirstMessage(field);
  }, true);

  function showToast(message, isError = false) {
    let hostElement = document.getElementById("memosaic-memory-toast-host");
    if (!hostElement) {
      hostElement = document.createElement("div");
      hostElement.id = "memosaic-memory-toast-host";
      hostElement.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:18px;top:18px;pointer-events:none";
      document.documentElement.appendChild(hostElement);
      hostElement.attachShadow({ mode: "open" });
    }
    const shadow = hostElement.shadowRoot;
    let notice = shadow.querySelector("div");
    if (!notice) {
      notice = document.createElement("div");
      notice.style.cssText = "font:13px/1.4 system-ui,sans-serif;color:#f8fafc;background:#172033;border:1px solid #334155;border-radius:10px;padding:10px 14px;box-shadow:0 8px 24px #0003;max-width:360px;opacity:0;transform:translateY(-4px);transition:opacity .18s,transform .18s";
      shadow.appendChild(notice);
    }
    notice.textContent = message;
    notice.style.background = isError ? "#7f1d1d" : "#172033";
    notice.style.opacity = "1";
    notice.style.transform = "translateY(0)";
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      notice.style.opacity = "0";
      notice.style.transform = "translateY(-4px)";
    }, 4200);
  }

  function malformedReason(text) {
    const compact = protocol.cleanText(text);
    const open = protocol.TOOL_CALL_OPEN;
    const close = protocol.TOOL_CALL_CLOSE;
    const start = compact.indexOf(open);

    if (start < 0) return "INVALID_TOOL_CALL: the tool payload is not valid JSON.";
    const end = compact.indexOf(close, start + open.length);
    if (end < 0) return "INVALID_TOOL_CALL: the tool wrapper is not closed.";

    const payload = compact.slice(start + open.length, end);
    const visible = payload.replace(/\s+/g, " ").trim().slice(0, 200);
    return `INVALID_TOOL_CALL: the tool payload is not valid JSON. Payload: ${visible || "(empty)"}`;
  }

  async function processToolCall(element, callInfo, text, routeKey) {
    snapshotElement(element);
    handledResponses.add(element);
    const request = callInfo.malformed
      ? Promise.resolve({ ok: false, error: malformedReason(text) })
      : chrome.runtime.sendMessage({ type: "TOOL_CALL", call: callInfo.call });

    try {
      const response = await request;
      const result = response?.ok ? response.result : (response?.error || "TOOL_ERROR: no response from the memory extension.");
      showToast(
        response?.ok
          ? i18n.translate(currentLocale, "toast.toolCompleted")
          : result,
        !response?.ok
      );
      if (routeKey !== conversationKey()) {
        showToast(i18n.translate(currentLocale, "toast.routeChanged"), true);
        return;
      }
      const followUp = protocol.createToolResultFollowUp(result, currentLocale);
      snapshotResponses();
      const sent = await sendText(followUp);
      if (!sent) {
        showToast(i18n.translate(currentLocale, "toast.sendFailed"), true);
      } else {
        turnIsActive = true;
        lastSubmitAt = Date.now();
      }
    } catch (error) {
      const fallback = i18n.translate(currentLocale, "toast.extensionUnavailable");
      showToast(i18n.translate(currentLocale, "toast.toolFailed", {
        error: error?.message || fallback
      }), true);
    }
  }

  function scanResponses() {
    scanTick += 1;
    if (!turnIsActive) {
      snapshotResponses();
      return;
    }

    const candidates = currentResponseCandidates();
    for (const element of candidates) {
      const text = normalizedText(element);
      if (handledResponses.has(element) || text.length > 24_000) continue;

      const baseline = previousText.get(element);
      if (baseline === undefined || text !== baseline) {
        // The reply is still streaming. Acting on a half-finished wrapper is a
        // way to read a truncated payload, so record the change and wait.
        previousText.set(element, text);
        textChangedAt.set(element, scanTick);
        continue;
      }

      if (!protocol.isSettled(scanTick, textChangedAt.get(element), STABLE_SCAN_TICKS)) continue;

      const callInfo = protocol.parseResponse(text);
      if (!callInfo) continue;
      const hasMatchingDescendant = candidates.some((other) => (
        other !== element && element.contains(other) && normalizedText(other) === text
      ));
      if (hasMatchingDescendant) continue;
      processToolCall(element, callInfo, text, conversationKey());
      return;
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanResponses, 500);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: false });
  snapshotResponses();

  function onRouteChange() {
    const nextKey = conversationKey();
    if (nextKey === currentConversationKey) return;
    const createdByRecentSubmit = Date.now() - lastSubmitAt < 7000;
    currentConversationKey = nextKey;
    if (createdByRecentSubmit && hasBootstrapped) {
      saveBootstrapState();
    } else {
      restoreConversationState();
      turnIsActive = false;
      snapshotResponses();
    }
  }

  window.addEventListener("popstate", onRouteChange);
  window.addEventListener("hashchange", onRouteChange);
  setInterval(onRouteChange, 900);
})();
