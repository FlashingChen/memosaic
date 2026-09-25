(() => {
  "use strict";

  const Memosaic = (globalThis.Memosaic = globalThis.Memosaic || {});
  const adapters = [];
  const byId = new Map();

  function requireString(config, key) {
    if (typeof config[key] !== "string" || config[key].trim() === "") {
      throw new TypeError(`Adapter "${config.id || "unknown"}" requires a non-empty ${key} string.`);
    }
  }

  function requireArray(config, key) {
    if (!Array.isArray(config[key]) || config[key].length === 0) {
      throw new TypeError(`Adapter "${config.id || "unknown"}" requires a non-empty ${key} array.`);
    }
  }

  function defineAdapter(rawConfig) {
    if (!rawConfig || typeof rawConfig !== "object") {
      throw new TypeError("Adapter definition must be an object.");
    }

    const config = { ...rawConfig };
    requireString(config, "id");
    requireString(config, "name");
    requireArray(config, "hosts");
    requireArray(config, "composerSelectors");
    requireArray(config, "responseSelectors");

    if (byId.has(config.id)) {
      throw new Error(`Adapter "${config.id}" is already registered.`);
    }

    config.hosts = config.hosts.map((host) => String(host).toLowerCase());
    config.composerSelectors = config.composerSelectors.map(String);
    config.responseSelectors = config.responseSelectors.map(String);
    if (Array.isArray(config.responseTextSelectors)) {
      config.responseTextSelectors = config.responseTextSelectors.map(String);
    }
    byId.set(config.id, config);
    adapters.push(config);
    return config;
  }

  function findForHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return adapters.find((adapter) => adapter.hosts.includes(host)) || null;
  }

  Memosaic.adapters = Object.freeze({
    define: defineAdapter,
    findForHost,
    list() {
      return adapters.slice();
    }
  });
})();
