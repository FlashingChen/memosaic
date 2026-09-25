#!/usr/bin/env node
/**
 * Copies the version from package.json into manifest.json.
 *
 * npm runs this automatically as the `version` lifecycle script, so
 * `npm version minor` bumps both files in the same commit and creates the
 * matching `v<version>` tag that the release workflow listens for. That keeps
 * the tag, package.json, and the manifest version — the number Chrome shows in
 * chrome://extensions — from drifting apart.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(repoRoot, "manifest.json");
const packagePath = join(repoRoot, "package.json");

const { version } = JSON.parse(readFileSync(packagePath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.version === version) {
  console.log(`manifest.json is already at ${version}.`);
} else {
  const previous = manifest.version;
  manifest.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest.json ${previous} -> ${version}`);
  // npm commits the working tree after the version script runs, so the edited
  // manifest has to be staged to land in the same commit as package.json.
  execFileSync("git", ["add", "manifest.json"], { cwd: repoRoot });
}
