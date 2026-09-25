<!--
  Keep the headings. They are what a reviewer reads first, and the checklist is
  what keeps `npm run check` and `npm test` honest without a CI gate.
-->

## What changed

<!-- A sentence or two. Link the issue if there is one: Fixes #123 -->

## Why

<!--
  The problem this solves. For a provider change, include the failing page URL
  shape with conversation IDs removed, and the smallest DOM evidence needed to
  understand what the provider changed.
-->

## Type of change

- [ ] Bug fix
- [ ] New provider adapter
- [ ] Adapter repair (a provider changed its DOM)
- [ ] Protocol, storage, or migration change
- [ ] Documentation or localization
- [ ] Build, CI, or tooling

## Checklist

- [ ] `npm run check` passes
- [ ] `npm test` passes
- [ ] For a provider change: I loaded the extension unpacked and ran the
      new-conversation smoke test in [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] This pull request contains no session tokens, cookies, conversation text,
      or personal memory excerpts
- [ ] Model-facing protocol changes stay backwards compatible, or the
      incompatibility is called out below

## Reviewer notes

<!--
  Anything that needs care: a protocol change, a storage migration, a release
  step, or a decision you would like a second opinion on.
-->
