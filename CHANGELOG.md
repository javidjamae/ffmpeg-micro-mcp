# @ffmpeg-micro/mcp-server

## 0.4.1

### Patch Changes

- [#23](https://github.com/javidjamae/ffmpeg-micro-mcp/pull/23) [`d77fd05`](https://github.com/javidjamae/ffmpeg-micro-mcp/commit/d77fd0573782fb27ba0c13ff79e9b6f508986e26) Thanks [@javidjamae](https://github.com/javidjamae)! - Fix job status values, which were wrong in three different ways at once.

  `transcode_and_wait` no longer hangs on a canceled job. Its terminal-status set spelled the status `cancelled` (British) while the API returns `canceled` (American), so the check never matched and the tool polled on until its timeout — up to 30 minutes — instead of returning. Nothing errored; it just sat there.

  `list_transcodes` can now filter by `pending`, which is a real status it previously omitted entirely, and no longer offers `queued`, which the API can never return. The database constrains job status to `pending`, `processing`, `completed`, `failed`, `canceled`, so a filter on `queued` matched nothing, silently, every time.

  `TranscodeStatus` and the tool descriptions now name exactly those five statuses. The descriptions are what an MCP client shows the model, so they were teaching every caller a status set that did not exist.

## 0.4.0

### Minor Changes

- [#20](https://github.com/javidjamae/ffmpeg-micro-mcp/pull/20) [`51bc987`](https://github.com/javidjamae/ffmpeg-micro-mcp/commit/51bc9871ce5fb80cea79a0cf103489bda13a0e8d) Thanks [@javidjamae](https://github.com/javidjamae)! - Add blueprint tools: `run_blueprint`, `get_blueprint_run`, `run_blueprint_and_wait`, and `continue_blueprint_run`. Agents can now run all 15 blueprints (caption-video with transcript review pause/resume, multi-output blueprints like listing-kit and hook-variants, and generative blueprints like product-ad) with clear guidance surfaced for insufficient-token (402), concurrency-cap (429), and temporarily-unavailable (503) responses.

- [#22](https://github.com/javidjamae/ffmpeg-micro-mcp/pull/22) [`426ba68`](https://github.com/javidjamae/ffmpeg-micro-mcp/commit/426ba6868823554cf6141b16bca953bdfecffe16) Thanks [@javidjamae](https://github.com/javidjamae)! - Declare `x-ffm-surface: mcp` on every API request, so blueprint runs started here are attributed to MCP rather than counted as generic API traffic.

  The API records the surface against each blueprint run. Without this header the gateway falls back to `api`, which makes an agent-driven run indistinguishable from a raw API client — the exact question "is anything using blueprints programmatically" could not be answered.

  `FFmpegMicroClientOptions.surface` overrides the default for anything embedding this client that is not the MCP server.

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
