# @ffmpeg-micro/mcp-server

[![npm version](https://img.shields.io/npm/v/@ffmpeg-micro/mcp-server.svg)](https://www.npmjs.com/package/@ffmpeg-micro/mcp-server)
[![CI](https://github.com/javidjamae/ffmpeg-micro-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/javidjamae/ffmpeg-micro-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents — Claude Desktop, Cursor, Continue, and any other MCP-compatible client — create, monitor, and download video transcodes through the [FFmpeg Micro](https://ffmpeg-micro.com) REST API.

## What it does

Exposes six tools that map onto FFmpeg Micro's public API:

| Tool | What it does |
| --- | --- |
| `transcode_video` | Create a transcode job from one or more input videos (`gs://` or `https://`). Supports quality/resolution presets and raw FFmpeg options. |
| `get_transcode` | Fetch the current state of a single job. |
| `list_transcodes` | List jobs with optional `status`, `page`, `limit`, `since`, `until` filters. |
| `cancel_transcode` | Cancel a queued or processing job. |
| `get_download_url` | Generate a 10-minute signed HTTPS URL for a completed job's output file. |
| `transcode_and_wait` | Convenience: create a job, poll until it finishes, return the signed download URL in one call. |

## Requirements

- An FFmpeg Micro API key — sign up at [ffmpeg-micro.com](https://ffmpeg-micro.com)

## Connect via HTTP (recommended)

The easiest way — no local install, no Node.js required. Add this to your MCP client config:

```json
{
  "mcpServers": {
    "ffmpeg-micro": {
      "type": "http",
      "url": "https://mcp.ffmpeg-micro.com",
      "headers": {
        "Authorization": "Bearer your_api_key_here"
      }
    }
  }
}
```

## Connect via stdio (local install)

Runs the server as a local process using `npx`. Requires Node.js 22.14 or later.

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "ffmpeg-micro": {
      "command": "npx",
      "args": ["-y", "@ffmpeg-micro/mcp-server"],
      "env": {
        "FFMPEG_MICRO_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

`npx -y` fetches the latest version each time. Any MCP client that supports stdio servers (Cursor, Continue, etc.) works the same way.

## Example prompts

Once wired up, you can ask things like:

- "Transcode `gs://my-bucket/raw.mp4` to 720p mp4 and give me the download URL when it's done."
- "List my failed jobs from this week."
- "Cancel job `b5f5a9c0-9e33-4e77-8a5b-6a0c2cd9c0b3`."
- "Add a text overlay that says 'Hello World' to `gs://my-bucket/input.mp4` and give me back the result."

## Development

```bash
git clone https://github.com/javidjamae/ffmpeg-micro-mcp.git
cd ffmpeg-micro-mcp
./scripts/setup.sh
```

`setup.sh` installs dependencies, builds, and wires up the git hooks.

Point your MCP client at the local build to iterate:

```json
{
  "mcpServers": {
    "ffmpeg-micro-dev": {
      "command": "node",
      "args": ["/absolute/path/to/ffmpeg-micro-mcp/dist/index.js"],
      "env": { "FFMPEG_MICRO_API_KEY": "…" }
    }
  }
}
```

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is the fastest way to iterate on tool schemas and responses:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

To run the HTTP server locally against a local API gateway:

```bash
FFMPEG_MICRO_API_URL=http://localhost:8081 npm run serve
```

### Running integration tests locally

```bash
FFMPEG_MICRO_API_KEY=your_key npm run test:integration
```

Integration tests hit the real FFmpeg Micro production API. They are read-only (no jobs are created).

## Release process

Releases are published to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers/) from GitHub Actions — no npm tokens stored in the repo. To cut a release:

1. Create a branch, bump the version in `package.json`, open and merge a PR.
2. Tag the merge commit: `git tag vX.Y.Z && git push --tags`.
3. The `release.yml` workflow runs tests, builds, and publishes to npm with automatic provenance attestation.

## License

MIT — see [LICENSE](./LICENSE).
