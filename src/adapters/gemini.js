(() => {
  "use strict";

  const Memosaic = (globalThis.Memosaic = globalThis.Memosaic || {});

  Memosaic.adapters.define({
    id: "gemini",
    name: "Gemini",
    hosts: ["gemini.google.com"],
    conversationKey(location) {
      const conversationId = location.pathname.match(/^\/app\/([^/]+)/)?.[1] || null;
      return conversationId ? `${location.origin}:gemini:${conversationId}` : null;
    },
    composerSelectors: [
      "rich-textarea [contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "textarea:not([disabled])",
      "[contenteditable='true']"
    ],
    placeholderPatterns: [/gemini|问问|message gemini|enter a prompt/i],
    responseSelectors: [
      "[data-test-id*='model-response']",
      "model-response",
      ".model-response-text",
      "message-content",
      "[class*='response-content']",
      "[class*='markdown']"
    ],
    // The turn element also holds the reasoning block and the action toolbar.
    // Gemini renders toolbar icons as text glyphs, so the element's own
    // innerText contains strings such as "thumb_up" and "more_vert" after the
    // reply. Read the reply body only.
    responseTextSelectors: [
      "[data-test-id*='model-response'] .markdown-main-panel",
      "model-response message-content",
      "message-content",
      ".markdown-main-panel",
      "[class*='response-content'] .markdown"
    ],
    userMessageSelectors: [
      "user-query",
      "[data-test-id*='user-query']",
      "[class*='user-query']",
      "[class*='query-content']"
    ],
    newChatPattern: /new chat|new conversation|start a new chat|新对话|开启新对话/i,
    // Gemini swaps one control between send and stop while it generates. Its
    // "Stop response" label also ends with the word "response", so the adapters
    // must name the stop label explicitly instead of inferring it.
    sendButtonSelectors: [
      "button[aria-label*='Send' i]",
      "button[aria-label*='发送']"
    ],
    sendButtonLabels: /send|send message|submit|发送|发送消息|提交/i,
    stopButtonLabels: /stop|stop response|cancel|停止|停止回答|中止|取消/i,
    sendFallback: "enter"
  });
})();
