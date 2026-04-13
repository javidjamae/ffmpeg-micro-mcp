import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { FFmpegMicroClient } from "./client.js";
import { registerTranscodeVideo } from "./tools/transcodeVideo.js";
import { registerGetTranscode } from "./tools/getTranscode.js";
import { registerListTranscodes } from "./tools/listTranscodes.js";
import { registerCancelTranscode } from "./tools/cancelTranscode.js";
import { registerGetDownloadUrl } from "./tools/getDownloadUrl.js";
import { registerTranscodeAndWait } from "./tools/transcodeAndWait.js";

const SERVER_NAME = "ffmpeg-micro-mcp";
const SERVER_VERSION = "0.1.0";

function createMcpServer(apiKey: string): McpServer {
  const client = new FFmpegMicroClient({
    apiKey,
    baseUrl: process.env.FFMPEG_MICRO_API_URL,
  });

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTranscodeVideo(server, client);
  registerGetTranscode(server, client);
  registerListTranscodes(server, client);
  registerCancelTranscode(server, client);
  registerGetDownloadUrl(server, client);
  registerTranscodeAndWait(server, client);

  return server;
}

/**
 * Creates the Express application for the HTTP MCP server.
 *
 * Auth: clients send `Authorization: Bearer <token>` where <token> is either
 * a static API key or an OAuth access token. The token is forwarded as-is to
 * the FFmpeg Micro API, so the MCP server never needs to know which kind it is.
 *
 * OAuth: Per the MCP spec, the MCP server acts as the authorization server from
 * the client's perspective. OAuth endpoints are proxied to the API gateway
 * (api.ffmpeg-micro.com) which handles the actual OAuth logic. The client only
 * ever talks to mcp.ffmpeg-micro.com.
 */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  const GATEWAY_URL =
    process.env.FFMPEG_MICRO_API_URL || "https://api.ffmpeg-micro.com";

  // Derive our own public base URL for metadata endpoints.
  // In production this is https://mcp.ffmpeg-micro.com; locally it's
  // whatever host the server is running on.
  const MCP_SERVER_URL =
    process.env.MCP_SERVER_URL || "https://mcp.ffmpeg-micro.com";

  // ─── OAuth discovery ────────────────────────────────────────────────────

  // RFC 8414: OAuth Authorization Server Metadata
  // MCP clients MUST check this first. All endpoints point to this server;
  // we proxy to the gateway internally.
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: MCP_SERVER_URL,
      authorization_endpoint: `${MCP_SERVER_URL}/oauth/authorize`,
      token_endpoint: `${MCP_SERVER_URL}/oauth/token`,
      registration_endpoint: `${MCP_SERVER_URL}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  // RFC 9728: OAuth Protected Resource Metadata (supplementary)
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: MCP_SERVER_URL,
      authorization_servers: [MCP_SERVER_URL],
    });
  });

  // ─── OAuth endpoints (proxied to gateway) ───────────────────────────────

  // Dynamic Client Registration (RFC 7591) — proxy to gateway
  app.post("/oauth/register", async (req, res) => {
    try {
      const upstream = await fetch(`${GATEWAY_URL}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch {
      res.status(502).json({ error: "server_error" });
    }
  });

  // Authorization endpoint — redirect browser to gateway (which redirects
  // to the web app consent page). This is a browser flow, not an API call.
  app.get("/oauth/authorize", (req, res) => {
    const url = new URL("/oauth/authorize", GATEWAY_URL);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") url.searchParams.set(key, value);
    }
    res.redirect(url.toString());
  });

  // Token exchange — proxy to gateway
  app.post("/oauth/token", async (req, res) => {
    try {
      const upstream = await fetch(`${GATEWAY_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch {
      res.status(502).json({ error: "server_error" });
    }
  });

  // ─── Health & MCP ──────────────────────────────────────────────────────

  // Health check — useful for Vercel and any uptime monitors.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Main MCP endpoint. Handles both POST (tool calls) and GET (SSE, if the
  // client requests it). In stateless mode the transport handles each request
  // independently — no session state is kept between calls.
  app.all("/", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : undefined;

    if (!token) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Missing credentials. Add an Authorization: Bearer <token> header. " +
            "Use your FFmpeg Micro API key as the token.",
        },
        id: null,
      });
      return;
    }

    const server = createMcpServer(token);
    // sessionIdGenerator: undefined → stateless mode (no session headers, no
    // server-side state). Required for serverless/Vercel deployments where
    // there is no persistent process to hold session state.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      await transport.close();
    }
  });

  return app;
}
