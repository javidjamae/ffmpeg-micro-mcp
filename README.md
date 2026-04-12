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

- Node.js **22.14** or later
- An FFmpeg Micro API key — sign up at [ffmpeg-micro.com](https://ffmpeg-micro.com)

## Install & run (Claude Desktop)

Add this to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "ffmpeg-micro": {
      "command": "npx",
      "args": ["-y", "@ffmpeg-micro/mcp-server"],
      "env": {
        "FFMPEG_MICRO_API_KEY": "ssk_your_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop and the FFmpeg Micro tools will appear in the tool picker. `npx -y` will fetch the latest version each time.

## Install & run (Cursor, Continue, other MCP clients)

Any MCP client that supports stdio-transport servers can run this the same way. Point it at:

- **Command:** `npx`
- **Args:** `["-y", "@ffmpeg-micro/mcp-server"]`
- **Env:** `FFMPEG_MICRO_API_KEY=<your key>`

## Configuration

Environment variables:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `FFMPEG_MICRO_API_KEY` | yes | — | Your FFmpeg Micro API key, sent as `Authorization: Bearer <key>`. |
| `FFMPEG_MICRO_API_URL` | no | `https://api.ffmpeg-micro.com` | Override for staging or self-hosted gateway instances. |

## Example prompts

Once wired up, you can ask things like:

- "Transcode `gs://my-bucket/raw.mp4` to 720p mp4 and give me the download URL when it's done."
- "List my failed jobs from this week."
- "Cancel job `b5f5a9c0-9e33-4e77-8a5b-6a0c2cd9c0b3`."
- "Add a text overlay that says 'Hello World' to `gs://my-bucket/input.mp4` and give me back the result."

Claude will pick the right tool(s) based on the task.

## Development

```bash
git clone https://github.com/javidjamae/ffmpeg-micro-mcp.git
cd ffmpeg-micro-mcp
npm install
npm run build
npm test
```

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

### Running integration tests locally

```bash
FFMPEG_MICRO_API_KEY=ssk_... npm run test:integration
```

Integration tests hit the real FFmpeg Micro production API. They are read-only (no jobs are created).

## Release process

Releases are published to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers/) from GitHub Actions — no npm tokens stored in the repo. To cut a release:

1. Bump the version in `package.json`.
2. Commit and tag: `git commit -am "Release vX.Y.Z" && git tag vX.Y.Z`.
3. Push: `git push && git push --tags`.
4. The `release.yml` workflow runs tests, builds, and publishes to npm with automatic provenance attestation.

## API reference

The full FFmpeg Micro REST API is documented in [`specs/openapi.yaml`](./specs/openapi.yaml) (OpenAPI 3.0). The MCP tools are thin wrappers around those endpoints — if you need functionality the tools don't cover, the endpoints are directly callable with your API key.

## License

MIT — see [LICENSE](./LICENSE).
