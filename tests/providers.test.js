import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

await import("../src/shared/namespace.js");
await import("../src/shared/providers.js");

const { providers } = globalThis.Memosaic;

test("provider metadata and the manifest expose the same supported hosts", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const matches = manifest.content_scripts.flatMap((entry) => entry.matches);
  for (const pattern of providers.contentScriptMatches()) {
    assert.ok(matches.includes(pattern), `missing manifest match pattern: ${pattern}`);
  }
  assert.equal(providers.fromHost("aistudio.xiaomimimo.com").id, "mimo");
});
