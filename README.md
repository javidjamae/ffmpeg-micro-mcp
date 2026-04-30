# @ffmpeg-micro/mcp-server

[![npm version](https://img.shields.io/npm/v/@ffmpeg-micro/mcp-server.svg)](https://www.npmjs.com/package/@ffmpeg-micro/mcp-server)
[![CI](https://github.com/javidjamae/ffmpeg-micro-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/javidjamae/ffmpeg-micro-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents — Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, and any other MCP-compatible client — create, monitor, and download video transcodes through the [FFmpeg Micro](https://ffmpeg-micro.com) REST API.

## What it does

Exposes tools that map onto FFmpeg Micro's public API:

| Tool | What it does |
| --- | --- |
| `transcode_video` | Create a transcode job from one or more input videos (`gs://` or `https://`). Supports quality/resolution presets and raw FFmpeg options. |
| `get_transcode` | Fetch the current state of a single job. |
| `list_transcodes` | List jobs with optional `status`, `page`, `limit`, `since`, `until` filters. |
| `cancel_transcode` | Cancel a queued or processing job. |
| `get_download_url` | Generate a 10-minute signed HTTPS URL for a completed job's output file. |
| `transcode_and_wait` | Convenience: create a job, poll until it finishes, return the signed download URL in one call. |
| `request_upload_url` | Step 1 of the direct-upload flow. Returns a presigned HTTPS URL that the host PUTs the file bytes to. |
| `confirm_upload` | Step 2 of the direct-upload flow. Returns the final `gs://` URL plus probe metadata, ready to use as a transcode/transcribe input. |

### Uploading a local file

The `request_upload_url` + `confirm_upload` pair lets an MCP host upload a local file to the FFmpeg Micro storage bucket without dealing with raw API keys or `gs://` URLs:

1. Host calls `request_upload_url` with `{filename, contentType, fileSize}` → receives a short-lived presigned HTTPS URL.
2. Host PUTs the file bytes to that URL with the same `Content-Type`.
3. Host calls `confirm_upload` with `{filename: <storage filename from step 1>, fileSize}` → receives the final `gs://...` `fileUrl`.
4. Host passes that `fileUrl` to `transcribe_audio` / `transcode_video` / `transcode_and_wait`.

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

### Smoke-testing the upload tools end-to-end

Unit tests use a mocked `fetch`, so they prove tool registration + Zod schemas + URL paths but not that the wire shapes match what the gateway actually returns. Two smoke scripts exercise the full `request_upload_url` → PUT → `confirm_upload` flow against a real MCP server using a real API key. Run them in order — stdio first (fastest signal), then a deployed HTTP server before/after merge:

```bash
# 1. stdio (local dist build) — spawns dist/index.js as a subprocess
npm run build
FFMPEG_MICRO_API_KEY=your_key node scripts/smoke-upload-stdio.mjs <local-file>

# 2. HTTP (any deployed server — local `npm run serve`, Vercel preview, or prod)
FFMPEG_MICRO_API_KEY=your_key MCP_URL=https://mcp.ffmpeg-micro.com/ \
  node scripts/smoke-upload-http.mjs <local-file>
```

Both scripts hit the production API by default and consume billable minutes (the stdio script chains into `transcribe_audio` for an end-to-end check). Pass a small file like `15-second.mp3` to keep the cost negligible.

#### Hitting protection-protected Vercel previews

Vercel preview deployments are gated by Deployment Protection by default. To exercise the HTTP smoke script against a preview URL, generate a Protection-Bypass-for-Automation token in the project's Vercel settings and pass it via `VERCEL_BYPASS`:

```bash
FFMPEG_MICRO_API_KEY=your_key \
  MCP_URL=https://your-preview.vercel.app/ \
  VERCEL_BYPASS=your_bypass_token \
  node scripts/smoke-upload-http.mjs <local-file>
```

The script sends the token as the `x-vercel-protection-bypass` header on every request. **It does not** send `x-vercel-set-bypass-cookie: true` — that variant triggers a 307 cookie-setting redirect on POST that the MCP SDK's `StreamableHTTPClientTransport` does not follow, so the request fails. The header alone returns 200 directly without the redirect dance.

## Release process

Releases are published to [npm](https://www.npmjs.com/package/@ffmpeg-micro/mcp-server) via [trusted publishing](https://docs.npmjs.com/trusted-publishers/) and to the [MCP Registry](https://registry.modelcontextprotocol.io) as `com.ffmpeg-micro/mcp-server`, authenticated via an Ed25519 DNS TXT record on `ffmpeg-micro.com`. The corresponding private key lives in the `MCP_PRIVATE_KEY` GitHub Actions secret. The npm side uses OIDC trusted publishing, so no npm token is stored.

Releases are automated via [Changesets](https://github.com/changesets/changesets). Contributors don't manually bump versions, tag commits, or run publish commands — they attach a changeset to their PR and the release pipeline handles the rest.

### Contributor flow (every PR)

Every PR that changes shipped code must include a changeset. A [CI check](.github/workflows/require-changeset.yml) enforces this.

```bash
# While working on your PR:
npx changeset
```

The CLI prompts for bump type (major/minor/patch) and a short summary. It writes a markdown file under `.changeset/` — commit that file with your PR.

**Escape hatches for non-release PRs** (docs, CI, internal refactor, test changes with no behavioral impact):

- Add the `no-changeset` label to the PR, **or**
- `npx changeset --empty` to explicitly declare "no release needed."

### Maintainer flow (cutting a release)

You don't manually cut releases. The pipeline does it:

1. **PRs land on `main`** with changeset files attached.
2. **`.github/workflows/release.yml`** runs on every push to `main`. When pending changesets exist, it opens (or updates) a `chore(release): version packages` PR authored by the action. That PR:
   - Runs `changeset version` to consume the pending changesets
   - Bumps `package.json`
   - Re-syncs `server.json` via `scripts/sync-server-version.mjs`
   - Appends entries to `CHANGELOG.md`
   - Commits the result to its own branch
3. **Review and merge** the Version Packages PR when you're ready to ship. You can let several changesets accumulate before merging — the PR updates itself as more land on `main`.
4. On merge, the release workflow runs again. This time there are no pending changesets, so `changesets/action` detects the version bump and:
   - `npm publish` (OIDC trusted publishing, with provenance attestation)
   - Creates the GitHub Release + git tag automatically
5. The workflow's final steps install `mcp-publisher`, authenticate via the DNS private key, and publish to the MCP Registry as `com.ffmpeg-micro/mcp-server`.

### Version-sync guard

`.github/workflows/release.yml` still runs a version-parity check on every push to `main`. If `package.json.version`, `server.json.version`, and `server.json.packages[0].version` ever drift, the build fails loudly. Normally `scripts/sync-server-version.mjs` keeps them aligned, but the guard catches manual edits that missed the sync.

### Verify

After the Version Packages PR is merged and the workflow is green:

```bash
npm view @ffmpeg-micro/mcp-server version
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=com.ffmpeg-micro/mcp-server" | jq '.servers[] | {v: .server.version, isLatest: ._meta."io.modelcontextprotocol.registry/official".isLatest}'
```

### Example: contributor walkthrough

Suppose you're adding a new `delete_transcode` tool. Your PR flow:

```bash
git switch -c feat/delete-transcode
# ... make the code + test changes ...

npx changeset
# ? Which packages would you like to include? › @ffmpeg-micro/mcp-server
# ? Which type of change is this for @ffmpeg-micro/mcp-server? › minor
# ? Please enter a summary for this change › Add delete_transcode tool

git add .changeset/*.md src/ tests/
git commit -m "feat: add delete_transcode tool"
git push -u origin feat/delete-transcode
gh pr create
```

CI runs three checks:
- `test` — unit tests
- `check` (Require changeset) — confirms `.changeset/*.md` is present
- `Vercel` — preview deploy

After merge, the Version Packages PR either opens or updates itself to include your entry. Merge that when you're ready to ship.

### Rules

- **Never edit version fields in `server.json` or `package.json` by hand.** Changesets owns both — `scripts/sync-server-version.mjs` mirrors `package.json` into `server.json`. The CI drift guard fails the release if they diverge.
- **Never `git tag` a release manually.** `changesets/action` creates the tag + GitHub Release as part of publish. Manual tags aren't picked up by the new workflow.
- **Never bypass the Require-changeset check** by committing changes to `.changeset/config.json` or `.changeset/README.md` (those don't count). Use `npx changeset`, the `no-changeset` label, or `npx changeset --empty`.

### Release-related files

- `package.json` — source of truth for version. Also holds `mcpName` (required by the MCP Registry for npm package validation). Bumped by `changeset version`.
- `server.json` — MCP Registry metadata. Version fields are auto-synced from `package.json`.
- `.changeset/config.json` — Changesets configuration (public access, GitHub-aware changelog formatter).
- `.changeset/*.md` — pending release notes waiting to be consumed by the next `changeset version` run.
- `scripts/sync-server-version.mjs` — mirrors `package.json` version into `server.json`.
- `.github/workflows/release.yml` — the publish pipeline (changesets/action + MCP Registry step).
- `.github/workflows/require-changeset.yml` — enforces changeset presence on PRs.

### Troubleshooting

- **`Require changeset` check fails on my PR** — run `npx changeset` and commit the generated file. For docs-only / CI-only PRs, add the `no-changeset` label or `npx changeset --empty`.
- **CI fails at the version-sync guard step** — `server.json` was edited manually. Locally: `node scripts/sync-server-version.mjs`, commit, push. The guard compares `package.json.version`, `server.json.version`, and `server.json.packages[0].version`.
- **`changesets/action` didn't open a Version Packages PR after my feature PR merged** — check that your PR's `.changeset/*.md` file actually had content (non-empty front matter with a bump type and summary). Empty changesets signal "no release needed" and are intentionally ignored.
- **`mcp-publisher publish` fails with "package not found"** — npm hasn't finished propagating the new version yet. The release workflow's `Determine if MCP Registry publish is needed` step retries `npm view` for up to ~50 seconds and backs off if the version still isn't live, deferring the registry publish to the next push to main (which self-heals the drift). If you see this in a manual run, just wait 30s and re-publish.
- **MCP Registry stuck a version behind npm** — the `Determine if MCP Registry publish is needed` step skipped (or returned `needed=false`). Push any commit to main to trigger a re-run; the gate compares `package.json` ↔ npm ↔ registry and catches up automatically. If it keeps skipping, check the step's log output for which version each source reported.
- **`mcp-publisher publish` fails validation with "mcpName mismatch"** — `package.json` `mcpName` must equal `server.json` `name` (both should be `com.ffmpeg-micro/mcp-server`).
- **`mcp-publisher login dns` fails with "public key mismatch"** — the `MCP_PRIVATE_KEY` secret no longer matches the TXT record on `ffmpeg-micro.com`. Regenerate the keypair locally, update both the TXT record and the GitHub secret.

## License

MIT — see [LICENSE](./LICENSE).
