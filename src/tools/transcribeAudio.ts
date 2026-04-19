import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const transcribeAudioInputShape = {
  media_url: z
    .string()
    .describe(
      "Audio or video URL to transcribe. gs://bucket/object (preferred, from the upload flow) or a public https:// URL.",
    ),
  language: z
    .string()
    .optional()
    .describe("Optional BCP-47 language hint (e.g. 'en', 'es'). Auto-detected when omitted."),
  task: z
    .enum(["transcribe", "translate"])
    .optional()
    .describe(
      "'transcribe' keeps the source language; 'translate' outputs English regardless of source. Defaults to 'transcribe'.",
    ),
} as const;

const transcribeAudioInputSchema = z.object(transcribeAudioInputShape);

export function registerTranscribeAudio(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "transcribe_audio",
    {
      title: "Transcribe Audio",
      description:
        "Generate an SRT subtitle file from an audio or video URL using Whisper. Returns a queued job envelope immediately — poll with `get_transcribe` until status is `completed`, then fetch the signed SRT URL with `get_transcribe_download`. The SRT URL can be dropped directly into a transcode's `subtitles='<url>'` filter to burn captions into a video.",
      inputSchema: transcribeAudioInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const parsed = transcribeAudioInputSchema.parse(args);
        const job = await client.createTranscribe(parsed);
        return jsonResult(job);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
