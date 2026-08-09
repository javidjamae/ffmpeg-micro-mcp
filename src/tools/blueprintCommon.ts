import { z } from "zod";
import { FFmpegMicroApiError } from "../client.js";
import { errorResult, type McpToolResult } from "./common.js";

export const BLUEPRINT_SLUGS = [
  "product-ad",
  "caption-video",
  "viral-short",
  "quote-card",
  "watermark",
  "resize-format",
  "zoom-in",
  "zoom-out",
  "camera-glide",
  "boomerang",
  "speed-changer",
  "video-to-gif",
  "product-slideshow",
  "listing-kit",
  "hook-variants",
] as const;

export const blueprintSlugSchema = z.enum(BLUEPRINT_SLUGS);

/**
 * Per-slug request fields, kept in the tool description because the API has
 * no catalog endpoint yet. * = required. Input URLs accept public https or
 * upload-bucket gs:// values (request_upload_url/confirm_upload produce
 * compatible fileUrl values).
 */
export const BLUEPRINT_FIELD_DOCS = `Per-blueprint input fields (* = required):
- product-ad: logo_url*, photo_url*, music_url? — GENERATIVE, costs 200 tokens
- caption-video: video_url*, language?, style? (bold-bottom|clean-lower|center-pop|top-title) — pauses at awaiting_review with srt_text for transcript review; resume with continue_blueprint_run
- viral-short: video_url*, hook_text*, style? (top-hook|center-statement|bottom-caption|lower-left), music_url?
- quote-card: quote*, name?, handle?, photo_url?, output? (video|image)
- watermark: video_url*, logo_url*, position? (top-left|top-right|bottom-left|bottom-right|center), size? (small|medium|large)
- resize-format: video_url*, format? (9x16|1x1|16x9|4x5), fit? (pad|crop)
- zoom-in: video_url*
- zoom-out: video_url*
- camera-glide: video_url*, direction? (right|left)
- boomerang: video_url*
- speed-changer: video_url*, speed? (0.5|1.5|2|4)
- video-to-gif: video_url*, length? (5|10|15), size? (480|640), caption?, caption_position? (bottom|top|center) — output is a .gif
- product-slideshow: photo1_url*, photo2_url*, photo3_url?..photo5_url?, music_url?, aspect? (9x16|1x1|16x9)
- listing-kit: video_url* — multi-output (4 platform variants in \`outputs\`)
- hook-variants: video_url*, hook1*, hook2?, hook3?, ratio? (9x16|4x5|1x1|original), style? (top-hook|center-statement|bottom-caption) — multi-output (one per hook in \`outputs\`)
Input URLs: public https or upload-bucket gs:// (use request_upload_url + confirm_upload to get one). FFmpeg-lane blueprints charge no tokens (they meter plan compute minutes); only generative blueprints (product-ad) charge tokens.`;

const DASHBOARD_URL = "https://www.ffmpeg-micro.com/dashboard/blueprints";

function blueprintErrorHelp(status: number, body: Record<string, unknown>): string | undefined {
  switch (body.error) {
    case "insufficient_tokens":
      return (
        `This generative blueprint requires ${body.tokens_required ?? "more"} tokens than the ` +
        `account has. Buy a token pack in the dashboard: ${DASHBOARD_URL}`
      );
    case "too_many_active_runs":
      return (
        `Too many generative blueprint runs are already active (max ${body.max_active_runs}). ` +
        `Wait for an active run to finish, then retry.`
      );
    case "generative_temporarily_unavailable":
      return (
        `Generative blueprints are temporarily unavailable. Retry in about ` +
        `${body.retry_after_minutes ?? "a few"} minutes.`
      );
    default:
      return status === 402
        ? `Payment required. Check token balance and plan quota in the dashboard: ${DASHBOARD_URL}`
        : undefined;
  }
}

/**
 * Like errorResult, but adds a `help` line for the blueprint billing/limit
 * errors (402 insufficient_tokens, 429 too_many_active_runs, 503
 * generative_temporarily_unavailable) so the calling agent knows what to do.
 */
export function blueprintErrorResult(error: unknown): McpToolResult {
  if (error instanceof FFmpegMicroApiError) {
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(error.body);
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      // Non-JSON body — fall through to the generic error result.
    }
    const help = blueprintErrorHelp(error.status, body);
    if (help) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: "ffmpeg_micro_api_error",
                method: error.method,
                path: error.path,
                status: error.status,
                statusText: error.statusText,
                ...body,
                help,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }
  return errorResult(error);
}
