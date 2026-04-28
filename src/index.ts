#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FFmpegMicroClient } from "./client.js";
import { registerTranscodeVideo } from "./tools/transcodeVideo.js";
import { registerGetTranscode } from "./tools/getTranscode.js";
import { registerListTranscodes } from "./tools/listTranscodes.js";
import { registerCancelTranscode } from "./tools/cancelTranscode.js";
import { registerGetDownloadUrl } from "./tools/getDownloadUrl.js";
import { registerTranscodeAndWait } from "./tools/transcodeAndWait.js";
import { registerTranscribeAudio } from "./tools/transcribeAudio.js";
import { registerGetTranscribe } from "./tools/getTranscribe.js";
import { registerGetTranscribeDownload } from "./tools/getTranscribeDownload.js";
import { registerRequestUploadUrl } from "./tools/requestUploadUrl.js";
import { registerConfirmUpload } from "./tools/confirmUpload.js";

// Loaded from the generated package.json at build time via tsc. This matches
// the published version so MCP clients can report the server version.
const SERVER_NAME = "ffmpeg-micro-mcp";
const SERVER_VERSION = "0.1.0";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function createServer(): McpServer {
  const apiKey = readEnv("FFMPEG_MICRO_API_KEY");
  if (!apiKey) {
    // Write to stderr so the MCP client can surface the error without
    // corrupting the stdio JSON-RPC stream on stdout.
    process.stderr.write(
      "ffmpeg-micro-mcp: FFMPEG_MICRO_API_KEY environment variable is required. " +
        "Set it in your MCP client configuration (e.g. Claude Desktop `env` block).\n",
    );
    process.exit(1);
  }

  const client = new FFmpegMicroClient({
    apiKey,
    baseUrl: readEnv("FFMPEG_MICRO_API_URL"),
  });

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTranscodeVideo(server, client);
  registerGetTranscode(server, client);
  registerListTranscodes(server, client);
  registerCancelTranscode(server, client);
  registerGetDownloadUrl(server, client);
  registerTranscodeAndWait(server, client);
  registerTranscribeAudio(server, client);
  registerGetTranscribe(server, client);
  registerGetTranscribeDownload(server, client);
  registerRequestUploadUrl(server, client);
  registerConfirmUpload(server, client);

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `ffmpeg-micro-mcp: fatal error — ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
