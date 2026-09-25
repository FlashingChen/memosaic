(() => {
  "use strict";

  const Memosaic = (globalThis.Memosaic = globalThis.Memosaic || {});

  Memosaic.adapters.define({
    id: "mimo",
    name: "Xiaomi MiMo Studio",
    hosts: ["aistudio.xiaomimimo.com"],
    conversationKey(location) {
      const conversationId = location.hash.match(/^#\/(?:chat|c|ultra)\/([^/?#]+)/)?.[1] || null;
      return conversationId ? `${location.origin}:mimo:${conversationId}` : null;
    },
    composerSelectors: [
      "textarea[placeholder*='有问题']",
      "textarea[placeholder*='Shift + Enter']",
      "textarea:not([disabled])",
      "[contenteditable='true'][role='textbox']"
    ],
    placeholderPatterns: [/有问题|尽管问|message|输入|ask/i],
    responseSelectors: [
      "[data-is-typing='false'].markdown-prose",
      ".markdown-prose",
      "[class*='Markdown_markdown']",
      "[class*='assistant-message']",
      "[class*='markdown']"
    ],
    userMessageSelectors: [
      "[class*='bg-mimo-bg-message']",
      "[data-role='user']",
      "[class*='user-message']",
      "[class*='human-message']"
    ],
    newChatPattern: /new chat|new conversation|start a new chat|新对话|开启新对话/i,
    sendButtonSelectors: [
      "button[aria-label*='发送']",
      "button[title*='发送']",
      "button[aria-label*='send' i]",
      "button[title*='send' i]"
    ],
    sendButtonLabels: /send|send message|submit|发送|发送消息|提交/i,
    sendFallback: "enter"
  });
})();
