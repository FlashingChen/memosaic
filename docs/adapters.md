# Adapter guide

An adapter is a declarative configuration with optional provider-local functions. It must not access `read_memory`, `edit_memory`, IndexedDB, or extension storage directly.

Start from [`src/adapters/_template.js`](../src/adapters/_template.js).

## Required fields

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | string | Stable lowercase provider identifier, for example `deepseek`. |
| `name` | string | Human-readable name used in history and authorization. |
| `hosts` | string[] | Exact hostnames, without a path or protocol. |
| `composerSelectors` | string[] | Candidate textarea or contenteditable selectors, most specific first. |
| `responseSelectors` | string[] | Candidate assistant message selectors, most specific first. |

## Optional fields

| Field | Type | Purpose |
| --- | --- | --- |
| `conversationKey(location)` | function | Returns a stable string for a conversation, or `null` for an unsaved new chat. Use `origin`, path or hash, and the provider id. |
| `placeholderPatterns` | RegExp[] | Helps choose the correct composer when a page has multiple editables. |
| `userMessageSelectors` | string[] | Excludes user-message elements from response scanning. |
| `isUserMessage(element)` | function | Custom user-message exclusion when selectors are insufficient. |
| `isResponseElement(element)` | function | Additional response filtering after visibility checks. |
| `getResponseText(element)` | function | Custom text extraction when `innerText` includes unrelated controls. |
| `newChatPattern` | RegExp | Text or accessible-label pattern for the new-chat control. |
| `sendButtonSelectors` | string[] | Exact send-button selectors, tried before generic buttons. |
| `sendButtonLabels` | RegExp | Accessible label, title, class, or text match for the send control. |
| `sendFallback` | `"enter"` | Press Enter when no enabled send button can be found. |

## Route examples

```js
conversationKey(location) {
  const id = location.pathname.match(/^\/chat\/([^/]+)/)?.[1];
  return id ? `${location.origin}:example:${id}` : null;
}
```

Hash-routed products can use `location.hash`:

```js
conversationKey(location) {
  const id = location.hash.match(/^#\/chat\/([^/?#]+)/)?.[1];
  return id ? `${location.origin}:example:${id}` : null;
}
```

## Selector rules

- Prefer stable semantic attributes over generated CSS-module class names.
- Include one broad fallback selector when the product has no semantic marker.
- Do not include user-message selectors in `responseSelectors`.
- Never use a selector that can match the entire application shell; it may include the user's prompt.
- Keep all selectors inside the adapter. Shared-controller edits should not be needed for a normal provider update.

## Register the provider

After creating the adapter:

1. Add its `matchPatterns` to `src/shared/providers.js`.
2. Add its script path to the `content_scripts[0].js` array in `manifest.json`.
3. Add its match pattern to the same manifest entry.
4. Map its hostname to its display name in `src/service-worker.js`.
5. Add tests in `tests/adapters.test.js`.

## Smoke test

Test in a brand-new conversation, not an existing one:

1. Prompt for personal context.
2. Verify the reasoning heading, if any, stays outside the tool wrapper.
3. Verify the extension executes the call and sends `<<<MEMOSAIC_MEMORY_TOOL_RESULT>>>`.
4. Verify the model answers the original prompt.
5. Open a second new conversation and verify the bootstrap is injected again.
