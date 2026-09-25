(() => {
  "use strict";

  const Memosaic = (globalThis.Memosaic = globalThis.Memosaic || {});
  const TOOL_CALL_OPEN = "<<<MEMOSAIC_MEMORY_TOOL_CALL>>>";
  const TOOL_CALL_CLOSE = "<<<END_MEMOSAIC_MEMORY_TOOL_CALL>>>";
  const TOOL_RESULT_OPEN = "<<<MEMOSAIC_MEMORY_TOOL_RESULT>>>";
  const TOOL_RESULT_CLOSE = "<<<END_MEMOSAIC_MEMORY_TOOL_RESULT>>>";
  const LEGACY_TOOL_CALL_OPEN = "<<<CAM_MEMORY_TOOL_CALL>>>";
  const LEGACY_TOOL_CALL_CLOSE = "<<<END_CAM_MEMORY_TOOL_CALL>>>";

  const callWrappers = [
    { open: TOOL_CALL_OPEN, close: TOOL_CALL_CLOSE, legacy: false },
    { open: LEGACY_TOOL_CALL_OPEN, close: LEGACY_TOOL_CALL_CLOSE, legacy: true }
  ];

  function createBootstrap(locale) {
    return Memosaic.i18n.translate(locale, "prompt.bootstrap", {
      toolOpen: TOOL_CALL_OPEN,
      toolClose: TOOL_CALL_CLOSE,
      resultOpen: TOOL_RESULT_OPEN
    });
  }

  function createToolResult(revision, memory) {
    return [
      TOOL_RESULT_OPEN,
      `revision: ${revision}`,
      memory,
      TOOL_RESULT_CLOSE
    ].join("\n");
  }

  function createToolResultFollowUp(result, locale) {
    return Memosaic.i18n.translate(locale, "prompt.followUp", { result });
  }

  function isAllowedReasoningPrefix(text) {
    const compact = text.trim().replace(/\s+/g, " ");
    if (!compact) return true;
    return /^(?:已深度思考|深度思考|思考中|正在思考)(?:（[^）]{0,120}）)?$/.test(compact) ||
      /^(?:Thought for|Thinking for|Reasoned for) [^.]{1,120}$/i.test(compact) ||
      /^(?:Thinking|Reasoning)$/i.test(compact);
  }

  function parseToolCall(text) {
    if (typeof text !== "string" || text.trim() === "") return null;
    const normalized = text.replace(/\r\n?/g, "\n");

    for (const wrapper of callWrappers) {
      const openIndex = normalized.indexOf(wrapper.open);
      if (openIndex < 0) continue;

      const closeIndex = normalized.indexOf(wrapper.close, openIndex + wrapper.open.length);
      if (closeIndex < 0) return { malformed: true, legacy: wrapper.legacy };
      if (normalized.indexOf(wrapper.open, openIndex + wrapper.open.length) >= 0) {
        return { malformed: true, legacy: wrapper.legacy };
      }

      const before = normalized.slice(0, openIndex).trim();
      const after = normalized.slice(closeIndex + wrapper.close.length).trim();
      if (!isAllowedReasoningPrefix(before) || after) {
        return { malformed: true, legacy: wrapper.legacy };
      }

      const payload = normalized.slice(openIndex + wrapper.open.length, closeIndex).trim();
      try {
        const call = JSON.parse(payload);
        if (!call || typeof call !== "object" || Array.isArray(call) || typeof call.name !== "string") {
          return { malformed: true, legacy: wrapper.legacy };
        }
        return { call, malformed: false, legacy: wrapper.legacy };
      } catch {
        return { malformed: true, legacy: wrapper.legacy };
      }
    }

    return null;
  }

  Memosaic.protocol = Object.freeze({
    TOOL_CALL_OPEN,
    TOOL_CALL_CLOSE,
    TOOL_RESULT_OPEN,
    TOOL_RESULT_CLOSE,
    createBootstrap,
    createToolResult,
    createToolResultFollowUp,
    parseToolCall
  });
})();
