---
"@ffmpeg-micro/mcp-server": patch
---

Fix the release workflow so the MCP Registry publish runs reliably.

The previous gate on the three MCP-Registry steps was `steps.changesets.outputs.published == 'true'`. During the 0.3.0 release, `npm publish` succeeded inside `changesets/action` but the `published` flag stayed false, so the registry publish silently skipped (the registry stuck at 0.2.0 even though npm shipped 0.3.0).

The new gate is a self-healing version-comparison: a `Determine if MCP Registry publish is needed` step compares the local `package.json` version, the latest version on npm, and the latest version on the MCP Registry. The three downstream steps (`Install mcp-publisher`, `Login to MCP Registry via DNS`, `Publish to MCP Registry`) only run when npm has the current version and the registry is behind.

Side effects:
- Drift recovery: if a previous run failed to publish to the registry, the next push to main re-runs the check and catches up.
- npm propagation race: if `npm view` doesn't yet show the new version, the gate backs off rather than racing the registry publish into "package not found". The next push catches up.
