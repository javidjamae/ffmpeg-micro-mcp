import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const getTranscodeInputShape = {
  id: z.string().describe("Transcode job UUID"),
} as const;

const getTranscodeInputSchema = z.object(getTranscodeInputShape);

export function registerGetTranscode(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "get_transcode",
    {
      title: "Get Transcode",
      description:
        "Fetch the current state of a single transcode job by ID, including status (queued/processing/completed/failed) and `output_url` when completed.",
      inputSchema: getTranscodeInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const { id } = getTranscodeInputSchema.parse(args);
        const job = await client.getTranscode(id);
        return jsonResult(job);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
