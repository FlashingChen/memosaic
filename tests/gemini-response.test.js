import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { containerText, extractBodyText } from "./fixtures/dom.js";

await import("../src/shared/namespace.js");
await import("../src/shared/i18n.js");
await import("../src/shared/protocol.js");
await import("../src/adapters/registry.js");
await import("../src/adapters/gemini.js");

const { protocol, adapters } = globalThis.Memosaic;
const gemini = adapters.findForHost("gemini.google.com");
const fixtureDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const geminiTurn = readFileSync(path.join(fixtureDirectory, "gemini-model-response.html"), "utf8");

test("the Gemini turn text is richer than the reply body", () => {
  // This is the live failure input. Reading the model-response element directly
  // picks up the reasoning block and the toolbar icon glyph names, so the text
  // around the wrapper is not just whitespace.
  const polluted = containerText(geminiTurn);
  assert.match(polluted, /Considering whether memory is needed/);
  assert.match(polluted, /thumb_up/);
  assert.match(polluted, /more_vert/);
});

test("the parser still reads the tool call from that turn text", () => {
  const result = protocol.parseToolCall(containerText(geminiTurn));
  assert.equal(result.malformed, false);
  assert.equal(result.legacy, false);
  assert.deepEqual(result.call, { name: "read_memory", arguments: {} });
});

test("Gemini declares a reply-body selector so the toolbar and reasoning are skipped", () => {
  assert.ok(Array.isArray(gemini.responseTextSelectors));
  assert.ok(gemini.responseTextSelectors.length > 0);
});

test("the adapter reply-body selectors reduce the turn to the tool-call wrapper", () => {
  const body = extractBodyText(geminiTurn, gemini);
  assert.ok(body.startsWith(protocol.TOOL_CALL_OPEN));
  assert.ok(body.endsWith(protocol.TOOL_CALL_CLOSE));
  assert.ok(!body.includes("thumb_up"));
  assert.ok(!body.includes("Considering whether memory is needed"));
  assert.match(body, /\{"name":"read_memory","arguments":\{\}\}/);
});

test("the extracted Gemini reply parses as a valid read_memory call", () => {
  const result = protocol.parseToolCall(extractBodyText(geminiTurn, gemini));
  assert.equal(result.malformed, false);
  assert.equal(result.legacy, false);
  assert.deepEqual(result.call, { name: "read_memory", arguments: {} });
});

test("parseResponse keeps the runtime contract for malformed and valid payloads", () => {
  const valid = protocol.parseResponse(containerText(geminiTurn));
  assert.equal(valid.malformed, false);
  assert.deepEqual(valid.call, { name: "read_memory", arguments: {} });

  const malformed = protocol.parseResponse(`${protocol.TOOL_CALL_OPEN}\nnot json\n${protocol.TOOL_CALL_CLOSE}`);
  assert.equal(malformed.malformed, true);
  assert.equal(malformed.call, null);
});
