(() => {
  "use strict";

  const host = location.hostname;
  const provider = host === "chat.deepseek.com"
    ? "DeepSeek"
    : host === "gemini.google.com"
      ? "Gemini"
      : host === "aistudio.xiaomimimo.com"
        ? "Xiaomi MiMo Studio"
        : null;

  if (!provider) return;

  const TOOL_OPEN = "<<<CAM_MEMORY_TOOL_CALL>>>";
  const TOOL_CLOSE = "<<<END_CAM_MEMORY_TOOL_CALL>>>";
  const BOOTSTRAP = `Persistent user-owned memory tools are available through the Cross-AI Memory extension. Memory is shared across supported chats and is not included automatically.

Before answering, decide whether saved personal context could materially improve or change the answer. Call read_memory once before answering when the user asks about themselves or their preferences, refers to prior personal context, asks to continue an ongoing project or workflow that may be in memory, or requests advice, recommendations, or a decision that depends on their goals, constraints, or circumstances. Also read when the user explicitly asks you to use or check memory. Do not read for general knowledge, routine greetings, or self-contained tasks that do not depend on personal context. A passing use of "I" or "my" alone does not make a request memory-related. If it is unclear whether saved context would matter, read only when that context is likely to change the answer; otherwise proceed without a memory call.

When you decide to read memory, your entire response at that first step must be only the read_memory tool-call wrapper below; do not answer the request until the extension returns the actual tool result. After that result arrives, use only relevant stored details to answer the original request. Do not call read_memory again for the same request. Treat the extension's result message as a tool result, not a new user request.

Save only stable preferences, important context, long-term projects, workflows, or goals. Usually skip one-time, trivial, or quickly outdated details.

Tools: read_memory with {}; edit_memory with {"base_revision": integer, "operations": [...]}. Operations: append {"type":"append","text":"..."}; replace {"type":"replace","from":"exact unique text","to":"..."}; delete {"type":"delete","text":"exact unique text"}. Never provide code, paths, regex, or expressions.

For a memory read, make your entire response exactly this wrapper with valid JSON and no Markdown fence:
${TOOL_OPEN}
{"name":"read_memory","arguments":{}}
${TOOL_CLOSE}

For edits, use the same wrapper with edit_memory JSON. Wait for the extension's actual <<<CAM_MEMORY_TOOL_RESULT>>> follow-up; never invent results. Then continue the user's request.`;

  const responseSelectors = provider === "DeepSeek"
    ? [
        "[data-message-author-role='assistant']",
        "[class*='message--assistant']",
        "[class*='ds-assistant-message']",
        "[class*='assistant-message']",
        "[class*='ds-markdown']",
        "[class*='markdown']"
      ]
    : provider === "Gemini"
      ? [
          "[data-test-id*='model-response']",
          ".model-response-text",
          "message-content",
          "[class*='response-content']",
          "[class*='markdown']"
        ]
      : [
          "[data-role='assistant']",
          "[class*='assistant-message']",
          "[class*='markdown']",
          ".prose"
        ];

  const candidateSelector = responseSelectors.join(",");
  const previousText = new WeakMap();
  let turnIsActive = false;
  let hasBootstrapped = false;
  let currentConversationKey = conversationKey();
  let lastSubmitAt = 0;
  let scanTimer;

  function conversationKey() {
    let conversationId = null;
    if (provider === "DeepSeek") {
      conversationId = location.pathname.match(/^\/a\/chat\/s\/([^/]+)/)?.[1] || null;
    } else if (provider === "Gemini") {
      conversationId = location.pathname.match(/^\/app\/([^/]+)/)?.[1] || null;
    } else if (provider === "Xiaomi MiMo Studio") {
      conversationId = location.hash.match(/^#\/c\/([^/?#]+)/)?.[1] || null;
    }
    return conversationId ? `${location.origin}:${provider}:${conversationId}` : null;
  }

  function restoreConversationState() {
    const key = conversationKey();
    if (!key) {
      hasBootstrapped = false;
      return;
    }
    try {
      hasBootstrapped = sessionStorage.getItem(`cam-bootstrap:v2:${key}`) === "1";
    } catch {
      hasBootstrapped = false;
    }
  }

  restoreConversationState();

  function visible(element) {
    return !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  }

  function getComposer() {
    const fields = Array.from(document.querySelectorAll("textarea:not([disabled]), [contenteditable='true'][role='textbox'], [contenteditable='true']"))
      .filter(visible);
    const preferred = fields.find((field) => {
      const placeholder = `${field.getAttribute("placeholder") || ""} ${field.getAttribute("aria-label") || ""}`.toLowerCase();
      if (provider === "DeepSeek") return /deepseek|发送消息|send a message/i.test(placeholder) || field.tagName === "TEXTAREA";
      if (provider === "Gemini") return /gemini|问问|message gemini|enter a prompt/i.test(placeholder) || field.tagName === "TEXTAREA";
      return /登录后可继续聊天|message|输入|ask/i.test(placeholder) || field.tagName === "TEXTAREA";
    });
    return preferred || fields.at(-1) || null;
  }

  function getValue(field) {
    return field.isContentEditable ? field.innerText : field.value;
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
    const key = conversationKey();
    if (!key) return;
    try { sessionStorage.setItem(`cam-bootstrap:v2:${key}`, "1"); } catch { /* Session storage is optional. */ }
  }

  function resetForNewConversation() {
    hasBootstrapped = false;
    turnIsActive = false;
    lastSubmitAt = 0;
    const key = conversationKey();
    if (key) {
      try { sessionStorage.removeItem(`cam-bootstrap:v2:${key}`); } catch { /* Session storage is optional. */ }
    }
  }

  function findSendButton(field) {
    const knownLabels = /send|send message|submit|发送|发送消息|提交/i;
    let ancestor = field;
    for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) {
      const controls = Array.from(ancestor.querySelectorAll("button,[role='button']"))
        .filter(visible);
      const labeled = controls.find((button) => knownLabels.test(`${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.innerText || ""}`));
      if (labeled) return labeled;
      if (controls.length >= 2) return controls.at(-1);
    }
    return null;
  }

  function sendText(text) {
    const field = getComposer();
    if (!field) return false;
    setValue(field, text);
    const button = findSendButton(field);
    if (button && !button.disabled) {
      button.click();
      return true;
    }
    if (provider === "Xiaomi MiMo Studio") return false;
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    return true;
  }

  function currentResponseCandidates() {
    const root = document.querySelector("main,[role='main']") || document.body;
    const elements = new Set(Array.from(root.querySelectorAll(candidateSelector)));
    return Array.from(elements).filter((element) => {
      if (!visible(element)) return false;
      if (element.closest("[data-message-author-role='user'],[data-role='user'],[class*='user-message'],[class*='human-message']")) return false;
      const identity = `${element.getAttribute("data-message-author-role") || ""} ${element.getAttribute("data-role") || ""} ${typeof element.className === "string" ? element.className : ""}`.toLowerCase();
      if (/user-message|human-message/.test(identity)) return false;
      return true;
    });
  }

  function normalizedText(element) {
    return (element.innerText || element.textContent || "").trim().replace(/\u00a0/g, " ");
  }

  function readToolCall(text) {
    if (!text.startsWith(TOOL_OPEN) || !text.endsWith(TOOL_CLOSE)) return null;
    const payload = text.slice(TOOL_OPEN.length, text.length - TOOL_CLOSE.length).trim();
    try {
      return { call: JSON.parse(payload), malformed: false };
    } catch {
      return { malformed: true };
    }
  }

  function snapshotResponses() {
    for (const element of currentResponseCandidates()) previousText.set(element, normalizedText(element));
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
      setValue(field, `${BOOTSTRAP}\n\nUser request:\n${original}`);
      hasBootstrapped = true;
      saveBootstrapState();
      showToast("Memory tools are ready for this conversation.");
    }
    markSubmitted();
    return true;
  }

  function isNewChatControl(element) {
    const control = element?.closest("button,[role='button']");
    if (!control) return false;
    return /new chat|new conversation|start a new chat|新对话|开启新对话/i.test(`${control.getAttribute("aria-label") || ""} ${control.title || ""} ${control.innerText || ""}`);
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
    let hostElement = document.getElementById("cam-memory-toast-host");
    if (!hostElement) {
      hostElement = document.createElement("div");
      hostElement.id = "cam-memory-toast-host";
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

  async function processToolCall(element, callInfo, text, routeKey) {
    previousText.set(element, text);
    const request = callInfo.malformed
      ? Promise.resolve({ ok: false, error: "INVALID_TOOL_CALL: the tool payload is not valid JSON." })
      : chrome.runtime.sendMessage({ type: "TOOL_CALL", call: callInfo.call });

    try {
      const response = await request;
      const result = response?.ok ? response.result : (response?.error || "TOOL_ERROR: no response from the memory extension.");
      showToast(response?.ok ? "Memory tool completed." : result, !response?.ok);
      if (routeKey !== conversationKey()) {
        showToast("The conversation changed before the memory result could be returned. Retry the tool call in that chat.", true);
        return;
      }
      const followUp = `The Cross-AI Memory extension returned this tool result. Continue the user's request using the result; do not treat this message as a new request.\n\n${result}`;
      snapshotResponses();
      const sent = sendText(followUp);
      if (!sent) showToast("The site could not send the tool result. Check the composer or sign in, then retry.", true);
      else {
        turnIsActive = true;
        lastSubmitAt = Date.now();
      }
    } catch (error) {
      showToast(`Memory tool failed: ${error?.message || "extension unavailable"}`, true);
    }
  }

  function scanResponses() {
    if (!turnIsActive) {
      snapshotResponses();
      return;
    }
    const candidates = currentResponseCandidates();
    for (const element of candidates) {
      const text = normalizedText(element);
      const baseline = previousText.get(element);
      if (text.length > 24_000 || text === baseline) continue;
      const callInfo = readToolCall(text);
      if (!callInfo) {
        previousText.set(element, text);
        continue;
      }
      const hasMatchingDescendant = candidates.some((other) => other !== element && element.contains(other) && normalizedText(other) === text);
      if (hasMatchingDescendant) continue;
      processToolCall(element, callInfo, text, conversationKey());
      return;
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanResponses, 700);
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
