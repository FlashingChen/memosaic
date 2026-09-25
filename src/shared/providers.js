(() => {
  "use strict";

  const Memosaic = (globalThis.Memosaic = globalThis.Memosaic || {});

  const providers = [
    {
      id: "deepseek",
      name: "DeepSeek",
      hosts: ["chat.deepseek.com"],
      matchPatterns: ["https://chat.deepseek.com/*"]
    },
    {
      id: "gemini",
      name: "Gemini",
      hosts: ["gemini.google.com"],
      matchPatterns: ["https://gemini.google.com/*"]
    },
    {
      id: "mimo",
      name: "Xiaomi MiMo Studio",
      hosts: ["aistudio.xiaomimimo.com"],
      matchPatterns: ["https://aistudio.xiaomimimo.com/*"]
    }
  ];

  const byHost = new Map();
  const byId = new Map();
  for (const provider of providers) {
    byId.set(provider.id, provider);
    for (const host of provider.hosts) byHost.set(host, provider);
  }

  Memosaic.providers = Object.freeze({
    list: Object.freeze(providers.map((provider) => Object.freeze({ ...provider }))),
    fromHost(host) {
      return byHost.get(host) || null;
    },
    fromId(id) {
      return byId.get(id) || null;
    },
    contentScriptMatches() {
      return providers.flatMap((provider) => provider.matchPatterns);
    }
  });
})();
