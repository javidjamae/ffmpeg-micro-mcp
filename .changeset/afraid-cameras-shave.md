---
"@ffmpeg-micro/mcp-server": patch
---

Fix job status values, which were wrong in three different ways at once.

`transcode_and_wait` no longer hangs on a canceled job. Its terminal-status set spelled the status `cancelled` (British) while the API returns `canceled` (American), so the check never matched and the tool polled on until its timeout — up to 30 minutes — instead of returning. Nothing errored; it just sat there.

`list_transcodes` can now filter by `pending`, which is a real status it previously omitted entirely, and no longer offers `queued`, which the API can never return. The database constrains job status to `pending`, `processing`, `completed`, `failed`, `canceled`, so a filter on `queued` matched nothing, silently, every time.

`TranscodeStatus` and the tool descriptions now name exactly those five statuses. The descriptions are what an MCP client shows the model, so they were teaching every caller a status set that did not exist.
