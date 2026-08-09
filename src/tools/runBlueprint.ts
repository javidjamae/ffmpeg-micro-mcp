import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { jsonResult, type McpToolResult } from "./common.js";
import {
  BLUEPRINT_FIELD_DOCS,
  blueprintErrorResult,
  blueprintSlugSchema,
} from "./blueprintCommon.js";

export const runBlueprintInputShape = {
  slug: blueprintSlugSchema.describe("Blueprint to run"),
  inputs: z
    .record(z.union([z.string(), z.number()]))
    .describe("Blueprint input fields keyed by name — see the tool description for each blueprint's fields"),
} as const;

const runBlueprintInputSchema = z.object(runBlueprintInputShape);

export function registerRunBlueprint(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "run_blueprint",
    {
      title: "Run Blueprint",
      description:
        "Start a blueprint run — a pre-built video workflow (captioning, resizing, watermarking, ads, and more). " +
        "Returns the new run ({id, status, blueprint, tokens_charged}); poll it with get_blueprint_run, or use " +
        "run_blueprint_and_wait to do both in one step.\n\n" +
        BLUEPRINT_FIELD_DOCS,
      inputSchema: runBlueprintInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const { slug, inputs } = runBlueprintInputSchema.parse(args);
        const run = await client.runBlueprint(slug, inputs);
        return jsonResult(run);
      } catch (err) {
        return blueprintErrorResult(err);
      }
    },
  );
}
