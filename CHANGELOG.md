# @ffmpeg-micro/mcp-server

## 0.3.0

### Minor Changes

- [#15](https://github.com/javidjamae/ffmpeg-micro-mcp/pull/15) [`7082bb8`](https://github.com/javidjamae/ffmpeg-micro-mcp/commit/7082bb8a025b6a1cab8ff3d8c62807650f8f2959) Thanks [@javidjamae](https://github.com/javidjamae)! - Add `request_upload_url` and `confirm_upload` tools for the direct-upload flow.

  This lets MCP hosts (Claude Code, Cursor, etc.) upload local files to ffmpeg-micro without needing a raw API key:

  1. Call `request_upload_url` with `{filename, contentType, fileSize}` → returns a short-lived presigned HTTPS URL.
  2. Host PUTs the file bytes to that URL with the same `Content-Type`.
  3. Call `confirm_upload` with `{filename, fileSize}` (using the storage filename returned in step 1) → returns the final `gs://` `fileUrl` plus probe metadata.
  4. Use the `fileUrl` as a `media_url` for `transcribe_audio` or as an `inputs[].url` for `transcode_video`.
