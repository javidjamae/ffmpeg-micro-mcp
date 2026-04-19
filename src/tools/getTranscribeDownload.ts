import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const getTranscribeDownloadInputShape = {
  id: z.string().describe("Completed transcribe job UUID"),
} as const;

const getTranscribeDownloadInputSchema = z.object(getTranscribeDownloadInputShape);

export function registerGetTranscribeDownload(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "get_transcribe_download",
    {
      title: "Get Transcribe Download URL",
      description:
        "Generate a short-lived (10 minute) signed HTTPS URL for a completed transcribe job's SRT file. The job must be in `completed` status. The returned URL can be dropped directly into a transcode's `subtitles='<url>'` filter to burn captions into a video.",
      inputSchema: getTranscribeDownloadInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const { id } = getTranscribeDownloadInputSchema.parse(args);
        const result = await client.getTranscribeDownloadUrl(id);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
