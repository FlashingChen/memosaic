# Cross-AI Memory

A local-first Chrome/Chromium Manifest V3 extension prototype. It keeps one editable Markdown memory document in the extension's IndexedDB and exposes two bounded operations to supported chat pages: `read_memory` and `edit_memory`.

## Supported chat pages

- DeepSeek: `chat.deepseek.com`
- Gemini: `gemini.google.com`
- Xiaomi MiMo Studio: `aistudio.xiaomimimo.com`

The MiMo adapter targets the official MiMo Studio chat page, rather than the Xiaomi MiMo product and API landing pages.

## Install locally

1. Open `chrome://extensions` in Chrome or a Chromium browser.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this project directory.
4. Open the extension popup and choose **Open memory editor** to inspect or edit the initial document.

## How tools work on web chat pages

These websites do not provide the extension with a provider-independent tool-calling API. On the first submitted message in a conversation, the adapter adds a short tool bootstrap to the user's message. It tells the model to call `read_memory` when personal context, preferences, prior context, an ongoing project, or advice tailored to the user's circumstances could materially affect the answer. General knowledge and self-contained tasks should not trigger a read. The bootstrap contains no memory content; when the model requests a read, its result is sent back in a follow-up chat message. If the model replies with the exact `<<<CAM_MEMORY_TOOL_CALL>>>` wrapper around one JSON call, the extension validates and executes only the built-in memory operation, then sends the result back as a follow-up chat message.

The bootstrap and tool result are visible in the conversation. DOM selectors and send behavior belong to each provider adapter and can change when a site updates. An adapter failure leaves the regular chat page alone; it may require the user to retry or continue manually.

## Local storage and revisions

Memory and the latest 50 edit records are stored in IndexedDB inside the browser extension profile. They are not uploaded or synchronized. Successful model or manual edits increment the revision. Each model edit supplies `base_revision`; exact `replace` and `delete` operations must match one unique substring. IndexedDB read/write transactions serialize concurrent edits and reject stale revisions.

The protocol does not evaluate code, expressions, or regular expressions and does not accept file paths. The extension has no network permission, remote API, shell access, or arbitrary file access.
