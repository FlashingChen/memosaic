#!/usr/bin/env node
/**
 * Builds the installable Memosaic bundle.
 *
 * Memosaic has no compile step, so "building" means selecting the runtime files
 * and archiving them. This script is the single source of truth for that file
 * list, which keeps the artifact published by the release workflow identical to
 * what you can produce locally with `npm run package`.
 *
 * The archive places `manifest.json` at its root, the layout that both
 * `chrome://extensions` (Load unpacked / drag-and-drop) and the Chrome Web
 * Store expect.
 *
 * Usage:
 *   node scripts/package.mjs [--out-dir dist] [--version 0.3.0]
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Runtime files copied to the archive root. */
const ROOT_FILES = [
  "manifest.json",
  "popup.html",
  "memory.html",
  "styles.css",
  "LICENSE",
];

/** Runtime directories copied recursively. */
const SOURCE_DIRS = ["src"];

/**
 * Development-only files that live inside a shipped directory. The adapter
 * template is scaffolding for contributors and is not part of the runtime.
 */
const EXCLUDED_FILES = new Set(["src/adapters/_template.js"]);

/** Chrome accepts one to four dot-separated integers, each at most 65535. */
const VERSION_PATTERN = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/;
const MAX_VERSION_PART = 65535;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(argv) {
  const options = { outDir: "dist", version: undefined };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (flag === "--out-dir") {
      if (!value) throw new Error("--out-dir requires a path");
      options.outDir = value;
      index += 1;
    } else if (flag === "--version") {
      if (!value) throw new Error("--version requires a value");
      options.version = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

function assertChromeVersion(version, source) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `${source} version "${version}" is not a valid extension version. ` +
        "Use one to four dot-separated integers such as 0.2.1 " +
        "(Chrome does not accept semver prerelease suffixes like -rc.1).",
    );
  }

  for (const part of version.split(".")) {
    if (Number(part) > MAX_VERSION_PART) {
      throw new Error(
        `${source} version "${version}" has a component above ${MAX_VERSION_PART}.`,
      );
    }
  }
}

function collectDirectory(dir) {
  const collected = [];

  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    const relativePath = `${dir}/${entry.name}`;

    if (entry.isDirectory()) {
      collected.push(...collectDirectory(relativePath));
    } else if (entry.isFile() && !EXCLUDED_FILES.has(relativePath)) {
      collected.push(relativePath);
    }
  }

  return collected;
}

function resolveBundleFiles() {
  const files = [...ROOT_FILES];

  for (const dir of SOURCE_DIRS) {
    files.push(...collectDirectory(dir));
  }

  return files.filter((file) => !EXCLUDED_FILES.has(file)).sort();
}

function createArchive(zipPath, files) {
  rmSync(zipPath, { force: true });

  try {
    execFileSync("zip", ["-9", "-X", "-q", zipPath, ...files], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "The `zip` command was not found on PATH. Install it " +
          "(macOS and Linux ship it by default) or build the archive on CI.",
      );
    }
    throw error;
  }
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const manifest = readJson(join(repoRoot, "manifest.json"));
  const packageJson = readJson(join(repoRoot, "package.json"));
  const version = options.version ?? manifest.version;

  assertChromeVersion(manifest.version, "manifest.json");
  assertChromeVersion(packageJson.version, "package.json");

  if (manifest.version !== packageJson.version) {
    throw new Error(
      `Version mismatch: manifest.json is ${manifest.version} but ` +
        `package.json is ${packageJson.version}. Run \`npm run sync-version\` ` +
        "to align them.",
    );
  }

  if (version !== manifest.version) {
    throw new Error(
      `Requested version ${version} does not match the extension version ` +
        `${manifest.version}. Bump the version with \`npm version <patch|minor|major>\` ` +
        "before tagging the release.",
    );
  }

  const files = resolveBundleFiles();
  const outDir = resolve(repoRoot, options.outDir);
  const zipName = `memosaic-${version}.zip`;
  const zipPath = join(outDir, zipName);

  mkdirSync(outDir, { recursive: true });
  createArchive(zipPath, files);

  const digest = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
  writeFileSync(`${zipPath}.sha256`, `${digest}  ${zipName}\n`);

  console.log(`Memosaic ${version}`);
  console.log(`  files  ${files.length}`);
  console.log(`  size   ${formatBytes(statSync(zipPath).size)}`);
  console.log(`  sha256 ${digest}`);
  console.log(`  output ${relative(repoRoot, zipPath)}`);
}

try {
  main();
} catch (error) {
  console.error(`package: ${error.message}`);
  process.exit(1);
}
