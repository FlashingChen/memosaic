import assert from "node:assert/strict";
import test from "node:test";

await import("../src/shared/namespace.js");
await import("../src/adapters/registry.js");
await import("../src/adapters/deepseek.js");
await import("../src/adapters/gemini.js");
await import("../src/adapters/mimo.js");

const { adapters } = globalThis.Memosaic;

test("registers one adapter per supported host", () => {
  assert.equal(adapters.findForHost("chat.deepseek.com").id, "deepseek");
  assert.equal(adapters.findForHost("gemini.google.com").id, "gemini");
  assert.equal(adapters.findForHost("aistudio.xiaomimimo.com").id, "mimo");
  assert.equal(adapters.findForHost("example.com"), null);
});

test("MiMo recognizes its live hash route", () => {
  const mimo = adapters.findForHost("aistudio.xiaomimimo.com");
  const key = mimo.conversationKey({
    origin: "https://aistudio.xiaomimimo.com",
    pathname: "/",
    hash: "#/chat/ad1c4ecf9e98b43e4ef60af84ea8d7ba"
  });
  assert.equal(key, "https://aistudio.xiaomimimo.com:mimo:ad1c4ecf9e98b43e4ef60af84ea8d7ba");

  const ultraKey = mimo.conversationKey({
    origin: "https://aistudio.xiaomimimo.com",
    pathname: "/",
    hash: "#/ultra/f67991269ac3272e0762044419d56a41"
  });
  assert.equal(ultraKey, "https://aistudio.xiaomimimo.com:mimo:f67991269ac3272e0762044419d56a41");
});

test("DeepSeek and Gemini retain their conversation key routes", () => {
  const deepseek = adapters.findForHost("chat.deepseek.com");
  const gemini = adapters.findForHost("gemini.google.com");
  assert.equal(
    deepseek.conversationKey({ origin: "https://chat.deepseek.com", pathname: "/a/chat/s/abc123", hash: "" }),
    "https://chat.deepseek.com:deepseek:abc123"
  );
  assert.equal(
    gemini.conversationKey({ origin: "https://gemini.google.com", pathname: "/app/xyz789", hash: "" }),
    "https://gemini.google.com:gemini:xyz789"
  );
});
