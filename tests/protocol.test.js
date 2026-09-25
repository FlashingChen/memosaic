import assert from "node:assert/strict";
import test from "node:test";

await import("../src/shared/namespace.js");
await import("../src/shared/i18n.js");
await import("../src/shared/protocol.js");

const { protocol } = globalThis.Memosaic;

test("creates an English bootstrap with the current protocol markers", () => {
  const prompt = protocol.createBootstrap("en");
  assert.match(prompt, /Memosaic extension/);
  assert.ok(prompt.includes(protocol.TOOL_CALL_OPEN));
  assert.ok(prompt.includes(protocol.TOOL_CALL_CLOSE));
});

test("creates a Chinese bootstrap", () => {
  const prompt = protocol.createBootstrap("zh-CN");
  assert.match(prompt, /Memosaic 扩展/);
  assert.match(prompt, /读取记忆/);
  assert.ok(prompt.includes(protocol.TOOL_CALL_OPEN));
});

test("parses an exact tool call", () => {
  const text = `${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}\n${protocol.TOOL_CALL_CLOSE}`;
  const result = protocol.parseToolCall(text);
  assert.equal(result.malformed, false);
  assert.deepEqual(result.call, { name: "read_memory", arguments: {} });
});

test("parses a MiMo response with a reasoning header before the wrapper", () => {
  const text = `已深度思考（用时 0.4 秒）\n${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}\n${protocol.TOOL_CALL_CLOSE}`;
  const result = protocol.parseToolCall(text);
  assert.equal(result.malformed, false);
  assert.equal(result.call.name, "read_memory");
});

test("accepts the legacy CAM wrapper during migration", () => {
  const text = `<<<CAM_MEMORY_TOOL_CALL>>>\n{"name":"read_memory","arguments":{}}\n<<<END_CAM_MEMORY_TOOL_CALL>>>`;
  const result = protocol.parseToolCall(text);
  assert.equal(result.malformed, false);
  assert.equal(result.legacy, true);
});

test("reads a wrapper that appears after surrounding prose", () => {
  const text = `Here is the call:\n${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}\n${protocol.TOOL_CALL_CLOSE}`;
  assert.equal(protocol.parseToolCall(text).malformed, false);
});

test("tolerates provider chrome after the wrapper", () => {
  // A response element can append reasoning or rendered action icons after the
  // reply, which Gemini does with its toolbar glyph names.
  const text = `${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}\n${protocol.TOOL_CALL_CLOSE}\nthumb_up\nthumb_down\nmore_vert`;
  const result = protocol.parseToolCall(text);
  assert.equal(result.malformed, false);
  assert.equal(result.call.name, "read_memory");
});

test("tolerates provider chrome before the wrapper", () => {
  const text = `Thought for 4 seconds\n${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}\n${protocol.TOOL_CALL_CLOSE}`;
  assert.equal(protocol.parseToolCall(text).malformed, false);
});

test("recovers the JSON object when the wrapper carries extra payload text", () => {
  const text = `${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}\ntrailing prose\n${protocol.TOOL_CALL_CLOSE}`;
  const result = protocol.parseToolCall(text);
  assert.equal(result.malformed, false);
  assert.deepEqual(result.call, { name: "read_memory", arguments: {} });
});

test("recovers a payload wrapped in a Markdown fence", () => {
  const text = `${protocol.TOOL_CALL_OPEN}\n\`\`\`json\n{"name":"read_memory","arguments":{}}\n\`\`\`\n${protocol.TOOL_CALL_CLOSE}`;
  assert.equal(protocol.parseToolCall(text).malformed, false);
});

test("removes invisible characters that break JSON parsing", () => {
  // JSON.parse rejects these outside a string, and they are invisible in the
  // chat UI, so a visually correct payload can still fail without cleanup.
  const zeroWidthSpaceOutsideString = `{"name":"read_memory"\u200b,"arguments":{}}`;
  assert.throws(() => JSON.parse(zeroWidthSpaceOutsideString));

  const text = `${protocol.TOOL_CALL_OPEN}\n${zeroWidthSpaceOutsideString}\n${protocol.TOOL_CALL_CLOSE}`;
  const result = protocol.parseToolCall(text);
  assert.equal(result.malformed, false);
  assert.deepEqual(result.call, { name: "read_memory", arguments: {} });
});

test("still rejects a payload without a JSON object", () => {
  const text = `${protocol.TOOL_CALL_OPEN}\nread_memory please\n${protocol.TOOL_CALL_CLOSE}`;
  assert.equal(protocol.parseToolCall(text).malformed, true);
});

test("still rejects a wrapper that is never closed", () => {
  const text = `${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}`;
  assert.equal(protocol.parseToolCall(text).malformed, true);
});

test("still rejects a repeated opening marker", () => {
  const text = `${protocol.TOOL_CALL_OPEN}\n${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}\n${protocol.TOOL_CALL_CLOSE}`;
  assert.equal(protocol.parseToolCall(text).malformed, true);
});

test("cleanText normalizes extraction artifacts", () => {
  assert.equal(protocol.cleanText("a\u00a0b"), "a b");
  assert.equal(protocol.cleanText(" \u2060a\u200b "), "a");
  assert.equal(protocol.cleanText("a\r\nb"), "a\nb");
});

test("a reply is only actionable once its text settles", () => {
  // A half-streamed wrapper can look complete enough to detect but not to parse,
  // and replying while the model still generates stops the answer.
  assert.equal(protocol.isSettled(1, 1, 3), false);
  assert.equal(protocol.isSettled(2, 1, 3), false);
  assert.equal(protocol.isSettled(4, 1, 3), true);
  assert.equal(protocol.isSettled(3, undefined, 3), false, "an unknown change tick must not be treated as settled");
});
