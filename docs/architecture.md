# Architecture

Memosaic is split into five layers.

## 1. Shared protocol

`src/shared/protocol.js` owns the model-facing tool markers, bootstrap generation, result generation, and the parser that recognizes a tool call in an assistant response.

The parser accepts a normal wrapper and a wrapper preceded only by known reasoning labels such as `已深度思考（用时 0.4 秒）`. This is required on providers that render an internal reasoning heading inside the same assistant response element.

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
