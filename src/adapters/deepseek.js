(() => {
  "use strict";

  const Memosaic = (globalThis.Memosaic = globalThis.Memosaic || {});

  Memosaic.adapters.define({
    id: "deepseek",
    name: "DeepSeek",
    hosts: ["chat.deepseek.com"],
    conversationKey(location) {
      const conversationId = location.pathname.match(/^\/a\/chat\/s\/([^/]+)/)?.[1] || null;
      return conversationId ? `${location.origin}:deepseek:${conversationId}` : null;
    },
    composerSelectors: [
      "textarea:not([disabled])",
      "[contenteditable='true'][role='textbox']",
      "[contenteditable='true']"
    ],
    placeholderPatterns: [/deepseek|发送消息|send a message/i],
    responseSelectors: [
      "[data-message-author-role='assistant']",
      "[class*='message--assistant']",
      "[class*='ds-assistant-message']",
      "[class*='assistant-message']",
      "[class*='ds-markdown']",
      "[class*='markdown']"
    ],
    userMessageSelectors: [
      "[data-message-author-role='user']",
      "[class*='user-message']",
      "[class*='human-message']"
    ],
    newChatPattern: /new chat|new conversation|start a new chat|新对话|开启新对话/i,
    sendButtonLabels: /send|send message|submit|发送|发送消息|提交/i,
    stopButtonLabels: /stop|stop generating|cancel|停止|停止生成|中止|取消/i,
    sendFallback: "enter"
  });
})();
