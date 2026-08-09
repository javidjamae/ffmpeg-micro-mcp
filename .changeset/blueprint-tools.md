---
"@ffmpeg-micro/mcp-server": minor
---

Add blueprint tools: `run_blueprint`, `get_blueprint_run`, `run_blueprint_and_wait`, and `continue_blueprint_run`. Agents can now run all 15 blueprints (caption-video with transcript review pause/resume, multi-output blueprints like listing-kit and hook-variants, and generative blueprints like product-ad) with clear guidance surfaced for insufficient-token (402), concurrency-cap (429), and temporarily-unavailable (503) responses.
