# Security

## Reporting

Please report a security issue privately to the repository owner rather than opening a public issue with exploit details.

## Security model

Memosaic is intentionally narrow.

- Memory stays in the browser profile's IndexedDB.
- The extension requests the `storage` permission only for the language setting.
- The content scripts run only on the three hostnames declared in `manifest.json`.
- The service worker accepts memory calls only from those hostnames and from extension pages.
- Models can request only `read_memory` and `edit_memory`.
- Edits require a current revision and exact, unique text matches.
- There is no arbitrary code execution, URL fetching, regular-expression engine, shell access, or file access.

The model-facing tool result and bootstrap are visible in the chat. Do not put secrets in the memory document.
