# Changelog

All notable changes to Memosaic are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Chrome accepts only one to four dot-separated integers as an extension version,
so there are no prerelease suffixes in a release tag.

## [Unreleased]

### Fixed

- A settled reply is read even when the page stops mutating. Settling was
  measured in scan ticks, and a tick only came from a DOM mutation, so a
  provider that renders its reply and then goes completely idle (DeepSeek) never
  satisfied the gate and the tool call sat unread in the transcript. The age of
  the last text change is now measured against the clock, and the scan is driven
  by a heartbeat as well as by mutations.
- A tool call can no longer fail silently. The service worker call sat outside
  the error handler and the reply was marked handled before its result was
  delivered, so a reloaded extension (dead extension context, which throws
  synchronously) or a worker that never answered left the conversation frozen
  with no toast and no retry. The call is now made inside the error handler with
  a 15 s timeout, the reply is only marked handled once its result has been
  sent, and a failure is retried up to three times before reporting what to do.
- A live turn is no longer stranded by a route change: a reply whose text is
  still changing re-arms the turn, so assigning a conversation id mid-answer
  cannot leave the reply unread.
- The same tool call is only delivered once per conversation inside a minute. A
  transcript re-render handed the call back as a new element, which element
  identity cannot dedupe, and the conversation received a second tool result and
  a second answer.
- The extension reports a dead extension context instead of appearing idle. A
  sticky notice and a console line now say that the page needs a refresh after
  the extension was reloaded, and the liveness check asks for the messaging
  function rather than `chrome.runtime.id`.
- A failed or wedged IndexedDB open is no longer cached for the life of the
  service worker, and an open that never settles now times out instead of
  hanging every memory call.

### Added

- `Memosaic.debug.state()` in the content script's console context reports why a
  turn did not complete, and `[Memosaic]` lines mark each step in the page
  console.

## [0.2.3] - 2026-09-25

### Added

- An icon set at 16, 32, 48, and 128 px, generated from a master render. Memosaic
  no longer shows Chrome's placeholder letter tile.
- The build produces a 512 px asset for listings and documentation.
- A Chinese translation of the README, with a language switcher in both files.

### Changed

- The extension popup, the memory editor tab, and the packaging script now use
  the icon set; the icon files ship inside the release archive.
- The README was rewritten to lead with the problem Memosaic solves, and to move
  storage internals, the localization contract, and the release procedure into
  collapsible sections.

### Fixed

- The release workflow's publish job ran without a checkout, so
  `gh release create` failed with `not a git repository`. It now checks out the
  repository, and the pinned actions were moved to v5.

## [0.2.2] - 2026-09-25

### Added

- `responseTextSelectors` in the adapter contract. An adapter can now point at
  the reply body declaratively instead of supplying provider code through
  `getResponseText`. Gemini renders a reasoning block and an action toolbar
  inside one `model-response` element, and the toolbar icon font renders as text
  such as `thumb_up`, so its turn text is much richer than the reply.
- A regression test and DOM fixtures for the Gemini response extraction.
- Tag-triggered release workflow: pushing a `v*` tag verifies, tests, packages,
  and publishes a GitHub release with the extension archive and a SHA-256
  checksum.

### Changed

- The tool-call parser discards text outside the wrapper and recovers one JSON
  object from a fenced or prose-wrapped payload. It still rejects an unclosed
  wrapper, a repeated opening marker, and a payload containing no JSON object.
  The parser is not a trust boundary: the payload is validated field by field in
  the store.
- MiMo recognizes its live hash route.
- The runtime treats a reply as actionable only once its text settles.

## 0.2.0 - 2026-09-25

Published before the release pipeline existed, so there is no GitHub release or
tag for this version.

### Added

- First public release. One editable Markdown memory document in the browser,
  shared with supported chat pages through two bounded tools, `read_memory` and
  `edit_memory`.
- Adapters for DeepSeek, Gemini, and Xiaomi MiMo Studio.
- English and Simplified Chinese for both the interface and the instruction
  injected into chat.

[Unreleased]: https://github.com/FlashingChen/memosaic/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/FlashingChen/memosaic/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/FlashingChen/memosaic/releases/tag/v0.2.2
