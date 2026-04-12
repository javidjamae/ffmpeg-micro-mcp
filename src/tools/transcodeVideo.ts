import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const transcodeVideoInputShape = {
  inputs: z
    .array(z.object({ url: z.string().describe("gs://bucket/object or https:// URL") }))
    .min(1)
    .max(10)
    .describe("One to ten input videos. Multiple inputs are concatenated in order."),
  outputFormat: z
    .enum(["mp4", "webm", "mov"])
    .describe("Container format for the output file"),
  preset: z
    .object({
      quality: z
        .enum(["high", "medium", "low"])
        .optional()
        .describe("Quality preset — maps to CRF (high=18, medium=23, low=28)"),
      resolution: z
        .enum(["480p", "720p", "1080p", "4k"])
        .optional()
        .describe("Output resolution preset"),
    })
    .optional()
    .describe("Simple mode — quality/resolution presets. Ignored if `options` is provided."),
  options: z
    .array(
      z.object({
        option: z
          .string()
          .describe(
            "FFmpeg flag (e.g. -c:v, -crf) OR a virtual option name prefixed with @ (e.g. @text-overlay).",
          ),
        argument: z
          .union([z.string(), z.record(z.unknown())])
          .describe("Flag value, or an object for virtual options."),
      }),
    )
    .optional()
    .describe("Advanced mode — raw FFmpeg options or virtual options. Overrides `preset`."),
} as const;

const transcodeVideoInputSchema = z.object(transcodeVideoInputShape);

export function registerTranscodeVideo(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "transcode_video",
    {
      title: "Transcode Video",
      description:
        "Create a video transcode job on FFmpeg Micro. Accepts one or more input videos (gs:// or https://) and an output format. Returns immediately with a queued job — use `get_transcode`, `list_transcodes`, or `transcode_and_wait` to follow progress.",
      inputSchema: transcodeVideoInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const parsed = transcodeVideoInputSchema.parse(args);
        const job = await client.createTranscode(parsed);
        return jsonResult(job);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
