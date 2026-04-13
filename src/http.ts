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
 * a static API key (available now) or an OAuth access token (future). The
 * token is forwarded as-is to the FFmpeg Micro API, so the MCP server itself
 * never needs to know which kind it is.
 */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  const GATEWAY_URL = process.env.FFMPEG_MICRO_API_URL || "https://api.ffmpeg-micro.com";

  // RFC 9728: OAuth Protected Resource Metadata
  // Tells MCP clients where to find the authorization server.
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: "https://mcp.ffmpeg-micro.com",
      authorization_servers: [GATEWAY_URL],
    });
  });

  // RFC 8414: OAuth Authorization Server Metadata
  // Some MCP clients look for this on the resource server itself rather than
  // following the authorization_servers pointer from the protected resource
  // metadata. We serve it here pointing to the gateway's OAuth endpoints.
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: GATEWAY_URL,
      authorization_endpoint: `${GATEWAY_URL}/oauth/authorize`,
      token_endpoint: `${GATEWAY_URL}/oauth/token`,
      registration_endpoint: `${GATEWAY_URL}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

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
      res.set(
        "WWW-Authenticate",
        'Bearer resource_metadata="https://mcp.ffmpeg-micro.com/.well-known/oauth-protected-resource"'
      );
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            'Missing credentials. Add an Authorization: Bearer <token> header. ' +
            'Use your FFmpeg Micro API key as the token.',
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
