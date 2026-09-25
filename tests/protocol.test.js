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

test("rejects arbitrary prose around a wrapper", () => {
  const text = `Here is the call:\n${protocol.TOOL_CALL_OPEN}\n{"name":"read_memory","arguments":{}}\n${protocol.TOOL_CALL_CLOSE}`;
  assert.equal(protocol.parseToolCall(text).malformed, true);
});
