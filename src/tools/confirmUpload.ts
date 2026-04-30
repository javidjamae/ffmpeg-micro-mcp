import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";

export const confirmUploadInputShape = {
  filename: z
    .string()
    .min(1)
    .describe(
      "Storage object name returned by `request_upload_url` (the `result.filename` field), NOT the original local filename.",
    ),
  fileSize: z
    .number()
    .int()
    .positive()
    .describe("File size in bytes — must match the size declared in `request_upload_url`."),
  uploadId: z
    .string()
    .optional()
    .describe("Optional upload tracking ID, if the gateway returned one with the presigned URL."),
} as const;

const confirmUploadInputSchema = z.object(confirmUploadInputShape);

export function registerConfirmUpload(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "confirm_upload",
    {
      title: "Confirm Upload",
      description:
        "Step 2 of the direct-upload flow. Call after PUTting the file bytes to the URL returned by `request_upload_url`. Returns the final `gs://...` `fileUrl` plus probe metadata (duration, format, codecs). Use the `fileUrl` directly as a `media_url` for `transcribe_audio` or as an `inputs[].url` for `transcode_video`.",
      inputSchema: confirmUploadInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const parsed = confirmUploadInputSchema.parse(args);
        const response = await client.confirmUpload(parsed);
        return jsonResult(response);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
