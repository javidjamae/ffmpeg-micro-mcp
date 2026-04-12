import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const cancelTranscodeInputShape = {
  id: z.string().describe("Transcode job UUID to cancel"),
} as const;

const cancelTranscodeInputSchema = z.object(cancelTranscodeInputShape);

export function registerCancelTranscode(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "cancel_transcode",
    {
      title: "Cancel Transcode",
      description:
        "Cancel a queued or processing transcode job. Jobs that are already completed, failed, or cancelled cannot be cancelled and return an error.",
      inputSchema: cancelTranscodeInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const { id } = cancelTranscodeInputSchema.parse(args);
        const result = await client.cancelTranscode(id);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
