import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { jsonResult, type McpToolResult } from "./common.js";
import { blueprintErrorResult } from "./blueprintCommon.js";

export const getBlueprintRunInputShape = {
  id: z.string().describe("Blueprint run ID"),
} as const;

const getBlueprintRunInputSchema = z.object(getBlueprintRunInputShape);

export function registerGetBlueprintRun(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "get_blueprint_run",
    {
      title: "Get Blueprint Run",
      description:
        "Fetch the current state of a blueprint run: status (pending/processing/awaiting_review/completed/failed), " +
        "current step, and outputs when completed. Multi-output blueprints (listing-kit, hook-variants) return an " +
        "`outputs` array of {label, url}; single-output blueprints return `output_url`. Download URLs are signed with " +
        "a 10-minute TTL — re-fetch this run for fresh links. A caption-video run in status awaiting_review includes " +
        "`srt_text`; review/edit it and resume with continue_blueprint_run.",
      inputSchema: getBlueprintRunInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const { id } = getBlueprintRunInputSchema.parse(args);
        const run = await client.getBlueprintRun(id);
        return jsonResult(run);
      } catch (err) {
        return blueprintErrorResult(err);
      }
    },
  );
}
