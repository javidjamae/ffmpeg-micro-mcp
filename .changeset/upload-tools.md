---
"@ffmpeg-micro/mcp-server": minor
---

Add `request_upload_url` and `confirm_upload` tools for the direct-upload flow.

This lets MCP hosts (Claude Code, Cursor, etc.) upload local files to ffmpeg-micro without needing a raw API key:

1. Call `request_upload_url` with `{filename, contentType, fileSize}` → returns a short-lived presigned HTTPS URL.
2. Host PUTs the file bytes to that URL with the same `Content-Type`.
3. Call `confirm_upload` with `{filename, fileSize}` (using the storage filename returned in step 1) → returns the final `gs://` `fileUrl` plus probe metadata.
4. Use the `fileUrl` as a `media_url` for `transcribe_audio` or as an `inputs[].url` for `transcode_video`.
