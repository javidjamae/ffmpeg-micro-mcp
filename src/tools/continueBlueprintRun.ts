import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { jsonResult, type McpToolResult } from "./common.js";
import { blueprintErrorResult } from "./blueprintCommon.js";

export const continueBlueprintRunInputShape = {
  id: z.string().describe("Blueprint run ID (must be in status awaiting_review)"),
  srt_text: z
    .string()
    .describe("The reviewed/edited SRT transcript to burn into the video"),
} as const;

const continueBlueprintRunInputSchema = z.object(continueBlueprintRunInputShape);

export function registerContinueBlueprintRun(
  server: McpServer,
  client: FFmpegMicroClient,
): void {
  server.registerTool(
    "continue_blueprint_run",
    {
      title: "Continue Blueprint Run",
      description:
        "Resume a caption-video blueprint run that paused in status awaiting_review for transcript review. " +
        "Pass the approved (optionally edited) SRT text; the run continues to render the captioned video. " +
        "Poll with get_blueprint_run afterwards.",
      inputSchema: continueBlueprintRunInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const { id, srt_text } = continueBlueprintRunInputSchema.parse(args);
        const run = await client.continueBlueprintRun(id, srt_text);
        return jsonResult(run);
      } catch (err) {
        return blueprintErrorResult(err);
      }
    },
  );
}
