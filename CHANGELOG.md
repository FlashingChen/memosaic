# Changelog

All notable changes to Memosaic are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Chrome accepts only one to four dot-separated integers as an extension version,
so there are no prerelease suffixes in a release tag.

## [Unreleased]

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
