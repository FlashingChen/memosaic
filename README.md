# Memosaic

**One local memory for every AI chat.**

Memosaic is a local-first Chrome/Chromium Manifest V3 extension. It keeps one editable Markdown memory document in the browser and exposes two bounded tools to supported chat pages:

- `read_memory` returns the current document and revision.
- `edit_memory` applies validated append, replace, or delete operations.

The name combines **memory** and **mosaic**: each AI conversation sees the same user-owned picture instead of requiring you to explain yourself again and again.

> Memosaic is the new name for the prototype previously called **CAM / Cross-AI Memory**.

## Supported providers

| Provider | Host | Status |
| --- | --- | --- |
| DeepSeek | `chat.deepseek.com` | Supported |
| Gemini | `gemini.google.com` | Supported |
| Xiaomi MiMo Studio | `aistudio.xiaomimimo.com` | Supported |

Each provider has its own adapter under [`src/adapters`](src/adapters). The shared controller never contains provider-specific DOM selectors or route logic.

## Install locally

1. Open `chrome://extensions` in Chrome or another Chromium browser.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this repository directory.
4. Open the Memosaic popup and choose **Open memory editor**.
5. Use the language selector in the popup or editor. English and Simplified Chinese are included; the setting controls both the UI and the model instruction injected into chat.

No account or remote service is required.

## How the web-chat bridge works

Supported web chat pages do not expose a provider-independent tool-calling API to extensions. On the first submitted message in a conversation, the selected adapter appends a short bootstrap to that message. The bootstrap contains no memory content. It tells the model when to request `read_memory` and how to wrap a tool call in the Memosaic protocol markers.

When the model replies with a validated wrapper, the content controller sends the call to the extension service worker. The service worker accepts only `read_memory` and `edit_memory`, validates the arguments and revision, executes the local operation, and returns a bounded result. The adapter sends that result as a follow-up chat message.

Provider-specific concerns are isolated in adapters:

- conversation route detection;
- composer and send-button discovery;
- response candidates;
- user-message exclusion;
- new-chat reset detection.

See [Adapter guide](docs/adapters.md) for the complete interface and a template.

## Project structure

```text
src/
  adapters/
    _template.js       copy this to add a provider
    deepseek.js
    gemini.js
    mimo.js
    registry.js
  content/
    runtime.js         shared DOM/controller loop
  shared/
    i18n.js            UI and prompt translations
    protocol.js        tool markers and parser
    providers.js       provider metadata
  memory-store.js      IndexedDB storage and revisions
  memory-page.js       local editor
  service-worker.js    background tool execution
  popup.js
tests/
  adapters.test.js
  protocol.test.js
  providers.test.js
scripts/
  package.mjs               builds the installable bundle
  sync-manifest-version.mjs keeps the manifest version in sync
docs/
  adapters.md
  architecture.md
.github/workflows/
  ci.yml                    check, test, and package on every change
  release.yml               build and publish a release from a tag
```

## Language support

The runtime selects a locale in this order:

1. the language saved in `chrome.storage.local`;
2. the browser language when the setting is `auto`;
3. English as the fallback.

Built-in locales:

- `en`
- `zh-CN`

To add another locale, add its messages in `src/shared/i18n.js`, add it to `SUPPORTED_LOCALES`, and add an option to `popup.html` and `memory.html`. Missing keys fall back to English.

## Storage and revisions

Memory and the latest 50 edit records are stored in IndexedDB inside the extension's browser profile. Memosaic migrates an existing `cross-ai-memory` database into the new `memosaic` database the first time the updated extension opens.

Successful model or manual edits increment the revision. Each model edit supplies `base_revision`; replace and delete operations must match one unique substring. Transactions serialize concurrent edits and reject stale revisions.

The protocol does not evaluate code, expressions, regular expressions, or file paths. The extension has no host permissions beyond the declared chat pages, no remote API, no shell access, and no arbitrary file access.

## Development

Requires Node.js 20 or newer.

```bash
npm run check
npm test
```

`npm run check` syntax-checks the browser scripts. `npm test` covers provider registration, route parsing, protocol parsing, the Gemini response-extraction regression, the MiMo reasoning-header regression, and localization.

### Build the installable bundle

The extension has no compile step, so `npm run package` selects the runtime files, validates the version, and writes `dist/memosaic-<version>.zip` with `manifest.json` at the archive root:

```bash
npm run package
# Memosaic 0.2.1
#   files  18
#   size   26.9 KiB
#   sha256 <digest>
#   output dist/memosaic-0.2.1.zip
```

The archive is the same file set the release workflow publishes, and `dist/` is ignored by git. `tests/`, `docs/`, and the contributor-only `src/adapters/_template.js` scaffolding are excluded. A `.sha256` file is written next to the archive; verify a download with `shasum -a 256 -c memosaic-0.2.1.zip.sha256`.

## Releasing

Releases are built by GitHub Actions, not by hand. [`.github/workflows/release.yml`](.github/workflows/release.yml) runs whenever a `v*` tag is pushed and publishes a GitHub release with the extension zip and its checksum attached.

The tag, `manifest.json`, and `package.json` must all carry the same version. `npm version` keeps them aligned automatically:

```bash
npm version patch          # or minor / major
git push --follow-tags
```

`npm version` bumps `package.json`, runs the `version` lifecycle script that copies the new number into `manifest.json`, commits both files, and creates the matching `v<version>` tag. Pushing that tag starts the release.

The workflow then:

1. refuses tags that are not shaped like `v1.2.3`;
2. confirms the tagged commit is reachable from the default branch;
3. runs `npm run check` and `npm test`;
4. builds the bundle with `npm run package -- --version <tag version>`, which fails if the tag and the two manifests disagree;
5. creates the release with generated notes, or replaces the assets when re-running for an existing tag.

`workflow_dispatch` runs the same pipeline for an existing tag, which is the way to republish after a failed job.

One bootstrap quirk is worth knowing: GitHub only runs a tag-triggered workflow once that workflow file is known on the default branch. So the *first* tag pushed together with a brand-new `release.yml` starts nothing. Push the workflow to the default branch first and tag afterwards, or re-push the tag (or dispatch the run) once it is there. Every later tag triggers normally, including when the branch and tag go up in a single `git push --follow-tags`.

Chrome's version syntax accepts one to four dot-separated integers and no prerelease suffix, so `v0.3.0-rc.1` is rejected — bump to `v0.3.0` or use a build like `v0.3.0.1`. Publishing to the Chrome Web Store is not wired up; it needs store API credentials and a reviewed listing.

## Contributing

Provider adapters are the main contribution path. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [the adapter guide](docs/adapters.md).

## License

MIT. See [LICENSE](LICENSE).
