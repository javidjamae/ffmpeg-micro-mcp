import { describe, it, expect } from "vitest";
import { FFmpegMicroClient } from "../../src/client.js";

/**
 * Live integration test against a real FFmpeg Micro gateway.
 *
 * Skipped unless FFMPEG_MICRO_API_KEY is set. In CI this is wired up by the
 * nightly workflow via a GitHub secret. Locally you can run it with:
 *
 *   FFMPEG_MICRO_API_KEY=sk_... npm run test:integration
 *
 * The test is read-only: it exercises listTranscodes() and reads back the
 * shape of the response. It intentionally does NOT create new jobs to avoid
 * billing noise. A follow-up test can create a small job once we have a
 * public sample asset on GCS.
 */
const apiKey = process.env.FFMPEG_MICRO_API_KEY;
const baseUrl = process.env.FFMPEG_MICRO_API_URL;
const runIt = apiKey && apiKey.length > 0 ? describe : describe.skip;

runIt("live prod gateway (FFMPEG_MICRO_API_KEY)", () => {
  it("lists transcodes", async () => {
    // Construct the client inside the test body so nothing happens at
    // describe-collection time when FFMPEG_MICRO_API_KEY is absent and the
    // suite is skipped.
    const client = new FFmpegMicroClient({ apiKey: apiKey!, baseUrl });
    const result = await client.listTranscodes({ limit: 1 });
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result).toHaveProperty("total");
    expect(typeof result.total).toBe("number");
  });
});
