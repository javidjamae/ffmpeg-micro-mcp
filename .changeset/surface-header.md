---
"@ffmpeg-micro/mcp-server": minor
---

Declare `x-ffm-surface: mcp` on every API request, so blueprint runs started here are attributed to MCP rather than counted as generic API traffic.

The API records the surface against each blueprint run. Without this header the gateway falls back to `api`, which makes an agent-driven run indistinguishable from a raw API client — the exact question "is anything using blueprints programmatically" could not be answered.

`FFmpegMicroClientOptions.surface` overrides the default for anything embedding this client that is not the MCP server.
