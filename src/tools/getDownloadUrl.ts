import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const getDownloadUrlInputShape = {
  id: z.string().describe("Completed transcode job UUID"),
} as const;

const getDownloadUrlInputSchema = z.object(getDownloadUrlInputShape);

export function registerGetDownloadUrl(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "get_download_url",
    {
      title: "Get Download URL",
      description:
        "Generate a short-lived (10 minute) signed HTTPS URL for a completed transcode's output file. The job must be in `completed` status. Use this instead of the `output_url` field on the job object, which is a `gs://` URL that HTTP clients cannot fetch directly.",
      inputSchema: getDownloadUrlInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const { id } = getDownloadUrlInputSchema.parse(args);
        const result = await client.getDownloadUrl(id);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
