import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { errorResult, jsonResult, type McpToolResult } from "./common.js";
import { transcodeVideoInputShape } from "./transcodeVideo.js";
import type { Transcode } from "../types.js";

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

export const transcodeAndWaitInputShape = {
  ...transcodeVideoInputShape,
  timeoutSeconds: z
    .number()
    .int()
    .positive()
    .max(30 * 60)
    .optional()
    .describe("Max time to wait for the job to complete, in seconds. Default 600 (10 min). Max 1800."),
  pollIntervalSeconds: z
    .number()
    .int()
    .positive()
    .max(60)
    .optional()
    .describe("Polling interval in seconds. Default 3."),
} as const;

const transcodeAndWaitInputSchema = z.object(transcodeAndWaitInputShape);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export interface TranscodeAndWaitResult {
  job: Transcode;
  downloadUrl: string | null;
  waitedMs: number;
  polls: number;
}

export function registerTranscodeAndWait(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "transcode_and_wait",
    {
      title: "Transcode and Wait",
      description:
        "One-shot convenience tool: creates a transcode job, polls until it reaches a terminal state (completed/failed/cancelled) or the timeout expires, and returns the final job plus a signed download URL if completed. Use this when you want the full transcode in one step without managing polling yourself.",
      inputSchema: transcodeAndWaitInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const parsed = transcodeAndWaitInputSchema.parse(args);
        const { timeoutSeconds, pollIntervalSeconds, ...createArgs } = parsed;
        const timeoutMs = (timeoutSeconds ?? DEFAULT_TIMEOUT_MS / 1000) * 1000;
        const pollMs = (pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_MS / 1000) * 1000;

        const initialJob = await client.createTranscode(createArgs);
        const jobId = initialJob.id;
        const start = Date.now();
        let polls = 0;
        let job = initialJob;

        while (!TERMINAL_STATUSES.has(job.status)) {
          const elapsed = Date.now() - start;
          if (elapsed >= timeoutMs) {
            return jsonResult({
              timedOut: true,
              waitedMs: elapsed,
              polls,
              job,
              message: `Timed out waiting for job ${jobId} to complete after ${Math.round(elapsed / 1000)}s. Job is still in status "${job.status}".`,
            });
          }
          await sleep(pollMs);
          polls += 1;
          job = await client.getTranscode(jobId);
        }

        let downloadUrl: string | null = null;
        if (job.status === "completed") {
          try {
            const res = await client.getDownloadUrl(jobId);
            downloadUrl = res.url;
          } catch {
            // Non-fatal: job completed but we couldn't fetch a download URL.
            // The LLM can retry with `get_download_url` if needed.
            downloadUrl = null;
          }
        }

        const result: TranscodeAndWaitResult = {
          job,
          downloadUrl,
          waitedMs: Date.now() - start,
          polls,
        };
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
