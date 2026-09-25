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
    userMessageSelectors: [
      "user-query",
      "[data-test-id*='user-query']",
      "[class*='user-query']",
      "[class*='query-content']"
    ],
    newChatPattern: /new chat|new conversation|start a new chat|新对话|开启新对话/i,
    sendButtonLabels: /send|send message|submit|发送|发送消息|提交/i,
    sendFallback: "enter"
  });
})();
