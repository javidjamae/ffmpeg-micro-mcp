<!--
Thanks for contributing! Please include a Changeset describing this PR's
release impact.

If this PR should ship in a new release:
    npx changeset
  (then commit the generated .changeset/*.md file)

If it's docs-only / CI tweak / test-only / internal refactor that should NOT
ship a new version, either:
  - add the `no-changeset` label, OR
  - add an empty changeset:  npx changeset --empty

The `Require changeset` workflow enforces this on every PR.
-->

## Summary

<!-- What does this PR change? Why? -->

## Release impact

<!-- One of:
  - patch: backwards-compatible bug fixes
  - minor: backwards-compatible new feature surface
  - major: breaking change
  - none: docs/CI/tests only (add the `no-changeset` label or an empty changeset)
-->

## Test plan

- [ ] Unit tests pass (`npm test`)
- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Build passes (`npm run build`)
