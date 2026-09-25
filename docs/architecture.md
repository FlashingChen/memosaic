# Architecture

Memosaic is split into five layers.

## 1. Shared protocol

`src/shared/protocol.js` owns the model-facing tool markers, bootstrap generation, result generation, and the parser that recognizes a tool call in an assistant response.

Response elements rarely contain the reply text alone: providers add a reasoning heading, an action toolbar whose icon font renders as text, a collapsed summary, or Markdown furniture. The parser therefore ignores text outside the wrapper, and the payload may carry a Markdown fence or trailing prose as long as one JSON object with a string tool name can be recovered from it, so a valid call is not lost to extraction noise.

The parser is not a trust boundary. Everything outside the wrapper is discarded without evaluation, and the payload is still validated field by field in the store. A stricter wrapper also stays rejected: an unclosed wrapper, a repeated opening marker, or a payload that contains no JSON object is reported as malformed.

## 2. Local memory store

`src/memory-store.js` owns IndexedDB, the current revision, history, validation, and transactional edits. It has no provider-specific knowledge.

The store migrates the legacy `cross-ai-memory` database into `memosaic` the first time the renamed extension opens.

## 3. Extension service worker

`src/service-worker.js` authenticates the sender by hostname, executes only built-in memory operations, and returns tool results. It never accepts arbitrary code, URLs, regular expressions, or paths from a model.

## 4. Provider adapters

Each file in `src/adapters` describes one website:

- hostnames;
- conversation route parser;
- composer candidates;
- response candidates;
- user-message exclusions;
- new-chat control patterns;
- send-button patterns and keyboard fallback.

Adapters are data plus small provider-local functions. They do not read or write memory directly.

## 5. Shared content controller

`src/content/runtime.js` runs on the supported chat pages. It selects an adapter by hostname, injects the localized bootstrap into the first outbound message, watches assistant responses, validates a tool call, calls the service worker, and sends the result back through the same adapter.

The controller uses a `WeakMap` for response text snapshots and a `WeakSet` for handled tool-call elements so a streaming reasoning header cannot trigger the same call twice.

## Adding a provider

A new provider normally requires only:

1. `src/adapters/<id>.js`;
2. one entry in `manifest.json`;
3. provider metadata in `src/shared/providers.js`;
4. sender authorization in `src/service-worker.js`;
5. tests for its route and any custom parser behavior.
