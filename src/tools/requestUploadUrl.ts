import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const requestUploadUrlInputShape = {
  filename: z
    .string()
    .min(1)
    .describe("Original filename, e.g. 'webinar.m4a'. Used as the suffix of the storage object name."),
  contentType: z
    .string()
    .min(1)
    .describe("MIME type of the file (e.g. 'audio/mp4', 'video/mp4', 'image/png'). Must be a supported media type."),
  fileSize: z
    .number()
    .int()
    .positive()
    .describe("File size in bytes (positive integer). Max 1.9GB."),
} as const;

const requestUploadUrlInputSchema = z.object(requestUploadUrlInputShape);

export function registerRequestUploadUrl(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "request_upload_url",
    {
      title: "Request Upload URL",
      description:
        "Step 1 of the direct-upload flow. Returns a short-lived presigned HTTPS URL that the caller PUTs the file bytes to (with the same Content-Type that was passed in). After the PUT succeeds, call `confirm_upload` with the same filename and fileSize to receive the final `gs://` URL for use as a transcode/transcribe input. The presigned URL expires in ~15 minutes.",
      inputSchema: requestUploadUrlInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const parsed = requestUploadUrlInputSchema.parse(args);
        const response = await client.getPresignedUploadUrl(parsed);
        return jsonResult(response);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
