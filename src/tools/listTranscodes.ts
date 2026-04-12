import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const listTranscodesInputShape = {
  status: z
    .enum(["queued", "processing", "completed", "failed", "cancelled"])
    .optional()
    .describe("Filter by job status"),
  page: z.number().int().positive().optional().describe("1-indexed page number"),
  limit: z.number().int().positive().max(100).optional().describe("Page size (max 100)"),
  since: z.string().optional().describe("ISO timestamp — only return jobs created at/after this time"),
  until: z.string().optional().describe("ISO timestamp — only return jobs created at/before this time"),
} as const;

const listTranscodesInputSchema = z.object(listTranscodesInputShape);

export function registerListTranscodes(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "list_transcodes",
    {
      title: "List Transcodes",
      description:
        "List transcode jobs for the authenticated account, with optional filters for status and time range. Paginated (default page 1, limit 20).",
      inputSchema: listTranscodesInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const params = listTranscodesInputSchema.parse(args);
        const result = await client.listTranscodes(params);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
