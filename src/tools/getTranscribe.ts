import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const getTranscribeInputShape = {
  id: z.string().describe("Transcribe job UUID"),
} as const;

const getTranscribeInputSchema = z.object(getTranscribeInputShape);

export function registerGetTranscribe(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "get_transcribe",
    {
      title: "Get Transcribe",
      description:
        "Fetch the current state of a single transcribe job by ID, including status (queued/processing/completed/failed) and `output_url` when completed. Mirrors `get_transcode` but for SRT generation jobs created via `transcribe_audio`.",
      inputSchema: getTranscribeInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const { id } = getTranscribeInputSchema.parse(args);
        const job = await client.getTranscribe(id);
        return jsonResult(job);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
