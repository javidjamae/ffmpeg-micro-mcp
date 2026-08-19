---
"@ffmpeg-micro/mcp-server": patch
---

`transcode_and_wait` and `run_blueprint_and_wait` now return an MCP **error result** when the job or run finishes `failed` (or, for transcodes, `canceled`), instead of a success-shaped payload that merely contains the failed status.

The full job/run object is still in the result text, with the API's real `error_message` hoisted to a top-level `error` field — quota guidance included. Nothing changes for completed jobs, timeouts, or `awaiting_review`.

Why: a success-shaped result containing `status: "failed"` is exactly how the n8n node and Make app rendered every failure as green for months. An MCP client — or a smaller model — deserves the same unambiguous signal a human does: `isError: true`.
