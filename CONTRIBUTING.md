# Contributing to Memosaic

Thanks for helping make one user-owned memory work across more AI products.

## Add or repair an adapter

1. Copy `src/adapters/_template.js` to `src/adapters/<provider>.js`.
2. Register the adapter with a unique `id`, display `name`, and exact hostnames.
3. Implement `conversationKey(location)` for the provider's route format.
4. Supply composer and response selectors.
5. Supply user-message selectors so Memosaic never treats a prompt as a model response.
6. Add `sendButtonSelectors` or a compatible `sendButtonLabels` pattern when the provider does not expose an accessible send label.
7. Add the provider's match pattern to `manifest.json`.
8. Add provider metadata to `src/shared/providers.js`.
9. Register the hostname and provider name in `src/service-worker.js`.
10. Add route and parser coverage to `tests/`.

The complete adapter contract is documented in [docs/adapters.md](docs/adapters.md).

## Provider changes

AI chat pages change frequently. A useful adapter fix should include:

- the failing page URL shape, with private conversation IDs removed;
- the smallest DOM tree or selector evidence needed to understand the change;
- the result of a fresh conversation smoke test;
- a regression test for any pure parsing or routing logic.

Do not include session tokens, cookies, private chat text, or personal memory excerpts in issues or commits.

## Localization

Add messages to `src/shared/i18n.js`, then expose the locale in the popup and memory editor selectors. Prompt localization is part of the feature: the model instruction must be translated, not only the extension UI.

## Before opening a pull request

```bash
npm run check
npm test
```

For a provider change, also load the extension unpacked and test this sequence in a **new conversation**:

1. Send a prompt that needs personal context.
2. Confirm the model emits the tool-call wrapper.
3. Confirm the extension returns the memory result.
4. Confirm the model answers the original prompt after the result.
5. Start another new conversation and confirm the bootstrap is injected again.

## Code style

- Keep adapters free of shared storage logic.
- Keep the shared controller free of provider hostnames, routes, and selectors.
- Prefer explicit selectors and exact route matching over broad text matching.
- Keep model-facing protocol changes backwards compatible when possible.
