# @ffmpeg-micro/mcp-server

[![npm version](https://img.shields.io/npm/v/@ffmpeg-micro/mcp-server.svg)](https://www.npmjs.com/package/@ffmpeg-micro/mcp-server)
[![CI](https://github.com/javidjamae/ffmpeg-micro-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/javidjamae/ffmpeg-micro-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents — Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, and any other MCP-compatible client — create, monitor, and download video transcodes through the [FFmpeg Micro](https://ffmpeg-micro.com) REST API.

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

## Quick start

Add this to your project's `.mcp.json` (or your MCP client's config):

```json
{
  "mcpServers": {
    "ffmpeg-micro": {
      "type": "http",
      "url": "https://mcp.ffmpeg-micro.com"
    }
  }
}
```

That's it. The first time your AI tool connects, it will open a browser window for you to sign in with your [FFmpeg Micro](https://ffmpeg-micro.com) account via OAuth. After you approve, the token is cached and you won't be asked again.

No API keys to copy, no environment variables to set.

## Authentication

### OAuth (recommended)

The MCP server supports OAuth 2.1 with PKCE and dynamic client registration. Your MCP client handles the entire flow automatically:

1. Client discovers OAuth endpoints via `/.well-known/oauth-authorization-server`
2. Client registers itself dynamically
3. Browser opens for you to sign in and approve access
4. Token is exchanged and cached — subsequent connections are instant

This is the default when you use the config above with no `headers` or `env` block.

### API key (alternative)

If you prefer to use an API key directly (e.g., for automation or CI), you can pass it as a Bearer token:

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

Get your API key from the [dashboard](https://www.ffmpeg-micro.com/dashboard/api-keys).

### stdio (local install)

Runs the server as a local process using `npx`. Requires Node.js 22.14 or later.

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

`npx -y` fetches the latest version each time. Any MCP client that supports stdio servers works with this config.

## Compatible tools

The HTTP config (OAuth) works with any MCP client that supports streamable HTTP transport:

- **Claude Code** (CLI)
- **Claude Desktop**
- **Cursor**
- **Windsurf**
- **VS Code** (GitHub Copilot MCP)

The stdio config works with any MCP client that supports stdio transport.

## Example prompts

Once connected, you can ask things like:

- "Transcode this video to 720p MP4 and give me the download URL when it's done."
- "Crop this landscape video to a square."
- "Add a text overlay saying 'Episode 12' to my video."
- "List my failed jobs from this week."
- "Cancel job `b5f5a9c0-9e33-4e77-8a5b-6a0c2cd9c0b3`."

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

Releases are published to [npm](https://www.npmjs.com/package/@ffmpeg-micro/mcp-server) via [trusted publishing](https://docs.npmjs.com/trusted-publishers/) and to the [MCP Registry](https://registry.modelcontextprotocol.io) via GitHub OIDC — no tokens stored in the repo.

### Cutting a release

From a clean `main`:

```bash
git checkout main && git pull
git status                       # must be clean

npm version patch                # 0.1.0 → 0.1.1  (bug fix)
# or: npm version minor          # 0.1.0 → 0.2.0  (feature)
# or: npm version major          # 0.1.0 → 1.0.0  (breaking)
# or: npm version 0.2.0-rc.1     # explicit / prerelease

git push --follow-tags
```

`npm version` bumps `package.json`, runs `scripts/sync-server-version.mjs` to mirror the new version into `server.json` (both `version` and `packages[0].version`), commits the two files, and creates the `vX.Y.Z` tag atomically.

### What CI does

The push triggers `.github/workflows/release.yml`, which on the `vX.Y.Z` tag:

1. Runs `npm run typecheck`, `npm run build`, `npm test`.
2. Runs the **version-sync guard** — fails the build if `package.json.version`, `server.json.version`, or `server.json.packages[0].version` have drifted.
3. `npm publish` with provenance attestation (trusted publishing via OIDC — no npm token).
4. Installs `mcp-publisher`, authenticates with `mcp-publisher login github-oidc` (reuses the workflow's `id-token`), then runs `mcp-publisher publish` to register the new version in the MCP Registry as `io.github.javidjamae/ffmpeg-micro-mcp`.

### Verify

After the workflow is green:

```bash
npm view @ffmpeg-micro/mcp-server version
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.javidjamae/ffmpeg-micro-mcp" | jq '.servers[0] | {name, version}'
```

### Rules

- **Never edit version fields in `server.json` by hand** — the sync script owns them. The CI drift guard will fail the release if they diverge from `package.json`.
- **Never hand-edit `package.json` version and commit** — always go through `npm version` so `server.json` stays in sync and the tag is created atomically.
- **Never tag without `npm version`** — the workflow assumes `vX.Y.Z` matches `package.json`.

### Release-related files

- `package.json` — source of truth for version. Also holds `mcpName` (required by the MCP Registry for npm package validation).
- `server.json` — MCP Registry metadata. Version fields are auto-synced from `package.json`.
- `scripts/sync-server-version.mjs` — runs during the `npm version` lifecycle.
- `.github/workflows/release.yml` — the publish pipeline.

### Troubleshooting

- **`npm version` fails with "working tree not clean"** — commit or stash local changes first.
- **CI fails at the version-sync guard step** — `server.json` was edited manually. Locally: `node scripts/sync-server-version.mjs`, commit, delete the bad tag (`git tag -d vX.Y.Z && git push --delete origin vX.Y.Z`), re-tag, re-push.
- **`mcp-publisher publish` fails with "package not found"** — npm hasn't finished propagating the new version yet. Re-run just the failed job after ~30 seconds.
- **`mcp-publisher publish` fails validation with "mcpName mismatch"** — `package.json` `mcpName` must equal `server.json` `name` (both should be `io.github.javidjamae/ffmpeg-micro-mcp`).

## License

MIT — see [LICENSE](./LICENSE).
