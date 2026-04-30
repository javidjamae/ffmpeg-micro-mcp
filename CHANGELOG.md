# @ffmpeg-micro/mcp-server

## 0.3.1

### Patch Changes

- [#18](https://github.com/javidjamae/ffmpeg-micro-mcp/pull/18) [`a9e1d44`](https://github.com/javidjamae/ffmpeg-micro-mcp/commit/a9e1d44884e1c89796a0b1eaf6dc6e0f271f3bc9) Thanks [@javidjamae](https://github.com/javidjamae)! - Fix the release workflow so the MCP Registry publish runs reliably.

  The previous gate on the three MCP-Registry steps was `steps.changesets.outputs.published == 'true'`. During the 0.3.0 release, `npm publish` succeeded inside `changesets/action` but the `published` flag stayed false, so the registry publish silently skipped (the registry stuck at 0.2.0 even though npm shipped 0.3.0).

  The new gate is a self-healing version-comparison: a `Determine if MCP Registry publish is needed` step compares the local `package.json` version, the latest version on npm, and the latest version on the MCP Registry. The three downstream steps (`Install mcp-publisher`, `Login to MCP Registry via DNS`, `Publish to MCP Registry`) only run when npm has the current version and the registry is behind.

  Side effects:

  - Drift recovery: if a previous run failed to publish to the registry, the next push to main re-runs the check and catches up.
  - npm propagation race: if `npm view` doesn't yet show the new version, the gate backs off rather than racing the registry publish into "package not found". The next push catches up.

## 0.3.0

### Minor Changes

- [#15](https://github.com/javidjamae/ffmpeg-micro-mcp/pull/15) [`7082bb8`](https://github.com/javidjamae/ffmpeg-micro-mcp/commit/7082bb8a025b6a1cab8ff3d8c62807650f8f2959) Thanks [@javidjamae](https://github.com/javidjamae)! - Add `request_upload_url` and `confirm_upload` tools for the direct-upload flow.

  This lets MCP hosts (Claude Code, Cursor, etc.) upload local files to ffmpeg-micro without needing a raw API key:

  1. Call `request_upload_url` with `{filename, contentType, fileSize}` → returns a short-lived presigned HTTPS URL.
  2. Host PUTs the file bytes to that URL with the same `Content-Type`.
  3. Call `confirm_upload` with `{filename, fileSize}` (using the storage filename returned in step 1) → returns the final `gs://` `fileUrl` plus probe metadata.
  4. Use the `fileUrl` as a `media_url` for `transcribe_audio` or as an `inputs[].url` for `transcode_video`.
