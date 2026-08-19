import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FFmpegMicroClient } from "../client.js";
import { jsonResult, type McpToolResult } from "./common.js";
import type { BlueprintRun } from "../types.js";
import {
  BLUEPRINT_FIELD_DOCS,
  blueprintErrorResult,
  blueprintSlugSchema,
} from "./blueprintCommon.js";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

export const runBlueprintAndWaitInputShape = {
  slug: blueprintSlugSchema.describe("Blueprint to run"),
  inputs: z
    .record(z.union([z.string(), z.number()]))
    .describe("Blueprint input fields keyed by name — see the tool description for each blueprint's fields"),
  timeoutSeconds: z
    .number()
    .int()
    .positive()
    .max(30 * 60)
    .optional()
    .describe("Max time to wait for the run to finish, in seconds. Default 600 (10 min). Max 1800."),
  pollIntervalSeconds: z
    .number()
    .int()
    .positive()
    .max(60)
    .optional()
    .describe("Polling interval in seconds. Default 5."),
} as const;

const runBlueprintAndWaitInputSchema = z.object(runBlueprintAndWaitInputShape);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export interface RunBlueprintAndWaitResult {
  run: BlueprintRun;
  waitedMs: number;
  polls: number;
  awaitingReview?: boolean;
  message?: string;
}

export function registerRunBlueprintAndWait(server: McpServer, client: FFmpegMicroClient): void {
  server.registerTool(
    "run_blueprint_and_wait",
    {
      title: "Run Blueprint and Wait",
      description:
        "One-shot convenience tool: starts a blueprint run and polls until it completes, fails, or pauses for review. " +
        "Returns the final run with `output_url` (or `outputs` [{label, url}] for multi-output blueprints — prefer " +
        "`outputs` when present). Download URLs are signed with a 10-minute TTL; re-fetch with get_blueprint_run for " +
        "fresh links. NOTE: caption-video pauses in status awaiting_review — this tool then returns early with " +
        "`awaitingReview: true` and the run's `srt_text`; review/edit the transcript and resume with " +
        "continue_blueprint_run. If your MCP client enforces a short per-request timeout (many default to 60s), " +
        "use run_blueprint + get_blueprint_run polling instead.\n\n" +
        BLUEPRINT_FIELD_DOCS,
      inputSchema: runBlueprintAndWaitInputShape,
    },
    async (args): Promise<McpToolResult> => {
      try {
        const parsed = runBlueprintAndWaitInputSchema.parse(args);
        const timeoutMs = (parsed.timeoutSeconds ?? DEFAULT_TIMEOUT_MS / 1000) * 1000;
        const pollMs = (parsed.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_MS / 1000) * 1000;

        const initialRun = await client.runBlueprint(parsed.slug, parsed.inputs);
        const runId = initialRun.id;
        const start = Date.now();
        let polls = 0;
        let run = initialRun;

        while (!TERMINAL_STATUSES.has(run.status)) {
          if (run.status === "awaiting_review") {
            const result: RunBlueprintAndWaitResult = {
              run,
              waitedMs: Date.now() - start,
              polls,
              awaitingReview: true,
              message:
                `Run ${runId} is awaiting transcript review. Review/edit the srt_text on the run, ` +
                `then call continue_blueprint_run with the approved SRT to finish rendering.`,
            };
            return jsonResult(result);
          }
          const elapsed = Date.now() - start;
          if (elapsed >= timeoutMs) {
            return jsonResult({
              timedOut: true,
              waitedMs: elapsed,
              polls,
              run,
              message: `Timed out waiting for blueprint run ${runId} to complete after ${Math.round(elapsed / 1000)}s. Run is still in status "${run.status}"; keep polling with get_blueprint_run.`,
            });
          }
          await sleep(pollMs);
          polls += 1;
          run = await client.getBlueprintRun(runId);
        }

        const result: RunBlueprintAndWaitResult = {
          run,
          waitedMs: Date.now() - start,
          polls,
        };
        // Same rule as transcode_and_wait: a failed run is an error result,
        // never a success-shaped payload. The run object stays in the text.
        if (run.status === "failed") {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error:
                      (run as { error_message?: string }).error_message ||
                      `Blueprint run ${runId} failed without producing output`,
                    ...result,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        return jsonResult(result);
      } catch (err) {
        return blueprintErrorResult(err);
      }
    },
  );
}
