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
  const attempts = new WeakMap();
  // How long a reply must stop changing before it is safe to read. This is a
  // duration, not a number of scans: the scan is driven by a heartbeat as well
  // as by mutations, so the reply is read on time even when the page is idle.
  const SETTLE_MS = 1200;
  const SCAN_INTERVAL_MS = 500;
  // A failed tool round trip stays retryable. Reloading the extension while a
  // page stays open leaves this content script with a dead extension context,
  // and a service worker can fail to answer; neither may leave a reply that was
  // already read sitting unanswered forever.
  const RETRY_MS = 4000;
  const MAX_ATTEMPTS = 3;
  const TOOL_TIMEOUT_MS = 15_000;
  // A transcript re-render hands the same tool call back as a new element, and
  // element identity cannot dedupe that. The result of the first delivery is
  // already in the conversation, so an identical call is only delivered once per
  // conversation inside this window.
  const DUPLICATE_DELIVERY_MS = 60_000;
  const deliveries = new Map();
  let currentLocale = i18n.normalizeLocale("auto");
  let turnIsActive = false;
  let hasBootstrapped = false;
  let currentConversationKey = conversationKey();
  let lastSubmitAt = 0;
  let lastToolCall = null;
  let lastError = null;
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

  // Reloading or updating the extension leaves this content script running with
  // a dead extension context: the DOM work keeps succeeding, every extension
  // call fails, and without this check the failure is completely silent. The
  // messaging function is the thing that must exist; a context that is gone has
  // no chrome.runtime at all, which is what "Cannot read properties of undefined
  // (reading 'sendMessage')" means.
  function extensionAlive() {
    try {
      return typeof globalThis.chrome?.runtime?.sendMessage === "function";
    } catch {
      return false;
    }
  }

  function log(...values) {
    try {
      console.debug("[Memosaic]", ...values);
    } catch {
      // Logging is optional.
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
    textChangedAt.set(element, Date.now());
  }

  function markSubmitted() {
    lastSubmitAt = Date.now();
    turnIsActive = true;
    snapshotResponses();
    // A submit is the moment the page can be told that this content script is
    // stale, instead of waiting for a tool call that can never be delivered.
    if (!extensionAlive()) {
      log("submit with a dead extension context; a refresh is required");
      showToast(i18n.translate(currentLocale, "toast.reloadRequired"), true, true);
    }
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

  function showToast(message, isError = false, sticky = false) {
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
    // A notice that asks for an action the user has to take stays until the next
    // notice replaces it, because the page cannot recover on its own.
    if (sticky) return;
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

  // A service worker that never answers must not become a reply that is never
  // read. The call itself is deferred into the promise so that a synchronous
  // throw (a dead extension context) is reported like any other failure.
  function withTimeout(start, milliseconds) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`no answer from the memory extension after ${milliseconds} ms`));
      }, milliseconds);
      Promise.resolve()
        .then(start)
        .then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          }
        );
    });
  }

  function finishAttempt(element, attempt, message, isFinal = false) {
    lastError = message;
    log("tool call failed", `attempt ${attempt.count}/${MAX_ATTEMPTS}`, message);
    if (isFinal || attempt.count >= MAX_ATTEMPTS) {
      handledResponses.add(element);
      showToast(i18n.translate(currentLocale, "toast.toolGaveUp", { error: message }), true);
      return;
    }
    showToast(i18n.translate(currentLocale, "toast.toolFailed", { error: message }), true);
  }

  async function processToolCall(element, callInfo, text, routeKey) {
    const attempt = attempts.get(element) || { count: 0 };
    attempt.count += 1;
    attempt.nextAt = Date.now() + RETRY_MS;
    attempts.set(element, attempt);
    snapshotElement(element);

    const describe = (error) => (error instanceof Error ? error.message : String(error || ""))
      || i18n.translate(currentLocale, "toast.extensionUnavailable");

    if (!extensionAlive()) {
      // Every call would fail, so say what to do instead of retrying into a void.
      handledResponses.add(element);
      lastError = "extension context invalidated";
      log("tool call dropped: the extension context is gone");
      showToast(i18n.translate(currentLocale, "toast.reloadRequired"), true, true);
      return;
    }

    if (callInfo.malformed) {
      // A malformed payload is the model's output, not a transient failure, so
      // repeating the same call would only repeat the same error.
      finishAttempt(element, attempt, malformedReason(text), true);
      return;
    }

    const deliveryKey = `${routeKey || location.origin}::${callInfo.call.name}:${JSON.stringify(callInfo.call.arguments ?? {})}`;
    const deliveredAt = deliveries.get(deliveryKey);
    if (deliveredAt !== undefined && Date.now() - deliveredAt < DUPLICATE_DELIVERY_MS) {
      handledResponses.add(element);
      log("duplicate tool call ignored", deliveryKey);
      return;
    }

    try {
      const response = await withTimeout(
        () => chrome.runtime.sendMessage({ type: "TOOL_CALL", call: callInfo.call }),
        TOOL_TIMEOUT_MS
      );

      if (!response?.ok) {
        // The reply is only marked handled once its result was delivered, so a
        // transient failure is retried by a later scan.
        finishAttempt(element, attempt, response?.error || "TOOL_ERROR: no response from the memory extension.");
        return;
      }

      lastToolCall = { name: callInfo.call?.name || null, at: Date.now(), ok: true };
      log("tool call answered", callInfo.call?.name || "(none)");
      showToast(i18n.translate(currentLocale, "toast.toolCompleted"));

      if (routeKey !== conversationKey()) {
        handledResponses.add(element);
        showToast(i18n.translate(currentLocale, "toast.routeChanged"), true);
        return;
      }

      const followUp = protocol.createToolResultFollowUp(response.result, currentLocale);
      snapshotResponses();
      const sent = await sendText(followUp);
      if (!sent) {
        finishAttempt(element, attempt, i18n.translate(currentLocale, "toast.sendFailed"));
        return;
      }

      handledResponses.add(element);
      attempts.delete(element);
      deliveries.set(deliveryKey, Date.now());
      for (const [key, at] of deliveries) {
        if (Date.now() - at > DUPLICATE_DELIVERY_MS) deliveries.delete(key);
      }
      turnIsActive = true;
      lastSubmitAt = Date.now();
      log("tool result delivered", deliveryKey);
    } catch (error) {
      finishAttempt(element, attempt, describe(error));
    }
  }

  function scanResponses() {
    try {
      scan();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      log("scan failed", lastError);
    }
  }

  function scan() {
    const now = Date.now();
    const candidates = currentResponseCandidates();

    for (const element of candidates) {
      const text = normalizedText(element);
      const baseline = previousText.get(element);

      if (baseline === undefined || text !== baseline) {
        // The reply is still streaming. Acting on a half-finished wrapper is a
        // way to read a truncated payload, so record the change and wait. A
        // reply that is still being written also proves a turn is live, so a
        // route change that cleared the flag cannot strand it.
        if (baseline !== undefined && !turnIsActive) {
          turnIsActive = true;
          log("reply activity re-armed the turn");
        }
        previousText.set(element, text);
        textChangedAt.set(element, now);
        continue;
      }

      if (!turnIsActive || handledResponses.has(element) || text.length > 24_000) continue;
      if (!protocol.isSettled(now, textChangedAt.get(element), SETTLE_MS)) continue;

      const callInfo = protocol.parseResponse(text);
      if (!callInfo) continue;
      const hasMatchingDescendant = candidates.some((other) => (
        other !== element && element.contains(other) && normalizedText(other) === text
      ));
      if (hasMatchingDescendant) continue;

      const attempt = attempts.get(element);
      if (attempt?.nextAt && now < attempt.nextAt) continue;

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

  // Mutations alone cannot guarantee a scan. A provider can render a reply and
  // then stop touching the DOM entirely, which is precisely the state that means
  // the reply has settled and its tool call is waiting to be read, so the scan
  // is driven by a heartbeat as well. While no turn is live the heartbeat only
  // refreshes the baselines, so a restored transcript is never replayed.
  setInterval(scanResponses, SCAN_INTERVAL_MS);

  snapshotResponses();

  function onRouteChange() {
    const nextKey = conversationKey();
    if (nextKey === currentConversationKey) return;
    const createdByRecentSubmit = Date.now() - lastSubmitAt < 7000;
    currentConversationKey = nextKey;
    log("route changed", nextKey);
    if (createdByRecentSubmit && hasBootstrapped) {
      saveBootstrapState();
      return;
    }
    restoreConversationState();
    turnIsActive = false;
    snapshotResponses();
  }

  // A small read-only surface for the DevTools console. Select the extension's
  // JavaScript context and run `Memosaic.debug.state()` to see why a turn did
  // not complete.
  Memosaic.debug = Object.freeze({
    state() {
      return {
        adapter: adapter.id,
        conversationKey: conversationKey(),
        turnIsActive,
        hasBootstrapped,
        extensionAlive: extensionAlive(),
        lastSubmitAt: lastSubmitAt ? new Date(lastSubmitAt).toISOString() : null,
        candidateCount: currentResponseCandidates().length,
        lastToolCall,
        lastError
      };
    }
  });

  window.addEventListener("popstate", onRouteChange);
  window.addEventListener("hashchange", onRouteChange);
  setInterval(onRouteChange, 900);
})();
