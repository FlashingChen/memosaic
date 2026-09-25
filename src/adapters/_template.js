/**
 * Copy this file to src/adapters/<provider>.js, replace the sample values, then:
 * 1. add your file to the content_scripts js array in manifest.json;
 * 2. add the provider match pattern and provider metadata in src/shared/providers.js;
 * 3. register the provider id and hostname in src/service-worker.js;
 * 4. add a smoke test in tests/adapters.test.js.
 */
(() => {
  "use strict";

  const Memosaic = (globalThis.Memosaic = globalThis.Memosaic || {});

  Memosaic.adapters.define({
    id: "example",
    name: "Example AI",
    hosts: ["chat.example.com"],
    conversationKey(location) {
      const conversationId = location.pathname.match(/^\/chat\/([^/]+)/)?.[1] || null;
      return conversationId ? `${location.origin}:example:${conversationId}` : null;
    },
    composerSelectors: [
      "textarea[placeholder*='message' i]",
      "[contenteditable='true'][role='textbox']"
    ],
    placeholderPatterns: [/message|ask/i],
    responseSelectors: [
      "[data-role='assistant']",
      "[class*='assistant-message']",
      "[class*='markdown']"
    ],
    userMessageSelectors: [
      "[data-role='user']",
      "[class*='user-message']"
    ],
    newChatPattern: /new chat|new conversation/i,
    sendButtonLabels: /send|submit/i,
    sendFallback: "enter"
  });
})();
