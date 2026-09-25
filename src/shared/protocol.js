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

  const NBSP = /\u00a0/g;
  // Zero-width and bidirectional formatting characters that text extraction can
  // pick up around a payload. They are invisible, so they cannot be reviewed by
  // a person, but they make JSON.parse fail.
  const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
  // C0/C1 controls other than the whitespace JSON allows. Some providers emit
  // U+2028/U+2029 between rendered blocks.
  const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g;

  function cleanText(text) {
    return String(text ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(NBSP, " ")
      .replace(INVISIBLE, "")
      .replace(CONTROL, "\n")
      .trim();
  }

  // A response element can contain provider chrome around the reply: a
  // reasoning heading, action icons rendered as text, or a collapsed summary.
  // Surrounding text is therefore tolerated. The payload itself stays strict:
  // it must be one JSON object with a string tool name.
  function isAllowedPrefix(text) {
    const compact = cleanText(text);
    if (!compact) return true;
    return !callWrappers.some((wrapper) => compact.includes(wrapper.open) || compact.includes(wrapper.close));
  }

  function findJsonObjectEnd(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }

    return -1;
  }

  function parsePayload(payload) {
    const candidates = [];
    const start = payload.indexOf("{");
    if (start >= 0) {
      const end = findJsonObjectEnd(payload, start);
      if (end > start) candidates.push(payload.slice(start, end));
    }
    candidates.push(payload);

    for (const candidate of candidates) {
      let call;
      try {
        call = JSON.parse(candidate);
      } catch {
        continue;
      }
      if (call && typeof call === "object" && !Array.isArray(call) && typeof call.name === "string") {
        return call;
      }
    }

    return null;
  }

  function parseToolCall(text) {
    if (typeof text !== "string" || text.trim() === "") return null;
    const normalized = cleanText(text);

    for (const wrapper of callWrappers) {
      const openIndex = normalized.indexOf(wrapper.open);
      if (openIndex < 0) continue;

      const closeIndex = normalized.indexOf(wrapper.close, openIndex + wrapper.open.length);
      if (closeIndex < 0) return { malformed: true, legacy: wrapper.legacy };
      if (normalized.indexOf(wrapper.open, openIndex + wrapper.open.length) >= 0) {
        return { malformed: true, legacy: wrapper.legacy };
      }

      if (!isAllowedPrefix(normalized.slice(0, openIndex))) {
        return { malformed: true, legacy: wrapper.legacy };
      }

      const payload = normalized.slice(openIndex + wrapper.open.length, closeIndex);
      const call = parsePayload(payload);
      if (!call) return { malformed: true, legacy: wrapper.legacy };
      return { call, malformed: false, legacy: wrapper.legacy };
    }

    return null;
  }

  // A reply is only safe to act on once its text has stopped changing. Reading a
  // half-streamed wrapper is a way to parse a truncated payload, and replying
  // while the model still generates stops that answer.
  function isSettled(scanTick, changedAtTick, stableTicks) {
    if (!Number.isFinite(changedAtTick)) return false;
    return scanTick - changedAtTick >= stableTicks;
  }

  Memosaic.protocol = Object.freeze({
    TOOL_CALL_OPEN,
    TOOL_CALL_CLOSE,
    TOOL_RESULT_OPEN,
    TOOL_RESULT_CLOSE,
    createBootstrap,
    createToolResult,
    createToolResultFollowUp,
    cleanText,
    isSettled,
    parseToolCall,
    parseResponse(text) {
      const result = parseToolCall(text);
      if (!result) return null;
      return { call: result.malformed ? null : result.call, malformed: result.malformed, legacy: result.legacy };
    }
  });
})();
