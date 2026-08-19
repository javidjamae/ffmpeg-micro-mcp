import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FFmpegMicroClient } from "../src/client.js";
import { registerTranscodeVideo } from "../src/tools/transcodeVideo.js";
import { registerGetTranscode } from "../src/tools/getTranscode.js";
import { registerListTranscodes } from "../src/tools/listTranscodes.js";
import { registerCancelTranscode } from "../src/tools/cancelTranscode.js";
import { registerGetDownloadUrl } from "../src/tools/getDownloadUrl.js";
import { registerTranscodeAndWait } from "../src/tools/transcodeAndWait.js";
import { registerTranscribeAudio } from "../src/tools/transcribeAudio.js";
import { registerGetTranscribe } from "../src/tools/getTranscribe.js";
import { registerGetTranscribeDownload } from "../src/tools/getTranscribeDownload.js";
import { registerRequestUploadUrl } from "../src/tools/requestUploadUrl.js";
import { registerConfirmUpload } from "../src/tools/confirmUpload.js";
import { registerRunBlueprint } from "../src/tools/runBlueprint.js";
import { registerGetBlueprintRun } from "../src/tools/getBlueprintRun.js";
import { registerRunBlueprintAndWait } from "../src/tools/runBlueprintAndWait.js";
import { registerContinueBlueprintRun } from "../src/tools/continueBlueprintRun.js";

/**
 * These tests call the tool registration functions and then invoke the tool
 * handlers directly via the low-level callback stashed on the returned
 * RegisteredTool. This avoids spinning up a full MCP transport round-trip for
 * every tool and keeps the unit tests focused on handler behavior.
 */

interface InvokableTool {
  callback: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

function makeClient(fetchImpl: typeof fetch): FFmpegMicroClient {
  return new FFmpegMicroClient({ apiKey: "test-key", fetch: fetchImpl });
}

function capturingServer(): {
  server: McpServer;
  tools: Map<string, InvokableTool>;
} {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const tools = new Map<string, InvokableTool>();
  const origRegister = server.registerTool.bind(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (name: string, config: any, cb: any) => {
    tools.set(name, { callback: cb });
    return origRegister(name, config, cb);
  };
  return { server, tools };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

describe("transcode_video tool", () => {
  it("creates a job and returns it as JSON", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "job-1", status: "pending" }), { status: 201 }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerTranscodeVideo(server, makeClient(fetchMock));
    const tool = tools.get("transcode_video")!;

    const result = await tool.callback({
      inputs: [{ url: "gs://b/x.mp4" }],
      outputFormat: "mp4",
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual({ id: "job-1", status: "pending" });
  });

  it("returns an error result when the API errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "quota exceeded" }), {
        status: 402,
        statusText: "Payment Required",
      }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerTranscodeVideo(server, makeClient(fetchMock));
    const result = await tools.get("transcode_video")!.callback({
      inputs: [{ url: "gs://b/x.mp4" }],
      outputFormat: "mp4",
    });
    expect(result.isError).toBe(true);
    const body = parseResult(result);
    expect(body.status).toBe(402);
    expect(body.error).toBe("ffmpeg_micro_api_error");
  });
});

describe("get_transcode tool", () => {
  it("fetches a job by id", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect((typeof url === "string" ? url : url.toString()).endsWith("/v1/transcodes/abc")).toBe(true);
      return new Response(JSON.stringify({ id: "abc", status: "completed" }), { status: 200 });
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerGetTranscode(server, makeClient(fetchMock));
    const result = await tools.get("get_transcode")!.callback({ id: "abc" });
    expect(parseResult(result)).toEqual({ id: "abc", status: "completed" });
  });
});

describe("list_transcodes tool", () => {
  it("forwards filters to the API", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr).toContain("status=processing");
      expect(urlStr).toContain("limit=5");
      return new Response(
        JSON.stringify({ items: [], page: 1, limit: 5, total: 0 }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerListTranscodes(server, makeClient(fetchMock));
    const result = await tools.get("list_transcodes")!.callback({
      status: "processing",
      limit: 5,
    });
    expect(parseResult(result).total).toBe(0);
  });
});

describe("cancel_transcode tool", () => {
  it("PATCHes the cancel endpoint and returns the result", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr.endsWith("/v1/transcodes/abc/cancel")).toBe(true);
      expect(init.method).toBe("PATCH");
      return new Response(
        JSON.stringify({ success: true, message: "Job cancelled successfully", job: { id: "abc", status: "canceled" } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerCancelTranscode(server, makeClient(fetchMock));
    const result = await tools.get("cancel_transcode")!.callback({ id: "abc" });
    const body = parseResult(result);
    expect(body.success).toBe(true);
    expect(body.job.status).toBe("canceled");
  });
});

describe("get_download_url tool", () => {
  it("returns a signed URL for a completed job", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr).toContain("?url=true");
      return new Response(
        JSON.stringify({ url: "https://signed.example/abc.mp4" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerGetDownloadUrl(server, makeClient(fetchMock));
    const result = await tools.get("get_download_url")!.callback({ id: "abc" });
    expect(parseResult(result).url).toBe("https://signed.example/abc.mp4");
  });
});

describe("transcode_and_wait tool", () => {
  it("polls until completed and returns the download URL", async () => {
    const responses: Array<() => Response> = [
      () => new Response(JSON.stringify({ id: "abc", status: "pending" }), { status: 201 }),
      () => new Response(JSON.stringify({ id: "abc", status: "processing" }), { status: 200 }),
      () =>
        new Response(
          JSON.stringify({ id: "abc", status: "completed", output_url: "gs://b/o.mp4" }),
          { status: 200 },
        ),
      () =>
        new Response(JSON.stringify({ url: "https://signed.example/abc.mp4" }), {
          status: 200,
        }),
    ];
    let call = 0;
    const fetchMock = vi.fn(async () => {
      const fn = responses[call++];
      if (!fn) throw new Error(`Unexpected fetch call #${call}`);
      return fn();
    }) as unknown as typeof fetch;

    const { server, tools } = capturingServer();
    registerTranscodeAndWait(server, makeClient(fetchMock));

    // Override the scheduler so the test doesn't sit for polling interval
    const origSetTimeout = globalThis.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).setTimeout = (fn: () => void) => origSetTimeout(fn, 0);

    try {
      const result = await tools.get("transcode_and_wait")!.callback({
        inputs: [{ url: "gs://b/x.mp4" }],
        outputFormat: "mp4",
        pollIntervalSeconds: 1,
        timeoutSeconds: 30,
      });
      const body = parseResult(result);
      expect(body.job.status).toBe("completed");
      expect(body.downloadUrl).toBe("https://signed.example/abc.mp4");
      expect(body.polls).toBe(2);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });

  // Regression test for the bug this file's TERMINAL_STATUSES fix addresses.
  //
  // The set previously held "cancelled" (British) while the API returns
  // "canceled" (American). Set.has() therefore never matched a canceled job,
  // so the loop polled on until the timeout instead of returning. Nothing
  // errored — it just hung, for up to 30 minutes.
  //
  // The assertion that matters is `polls`. A test that only checked
  // `body.job.status === "canceled"` would pass even with the bug present,
  // because the timeout path also returns the last job it saw. Asserting that
  // it stopped on the SECOND poll is what pins the behaviour.
  it("stops immediately when a job is canceled, and does not poll to timeout", async () => {
    const responses: Array<() => Response> = [
      () => new Response(JSON.stringify({ id: "abc", status: "pending" }), { status: 201 }),
      () => new Response(JSON.stringify({ id: "abc", status: "canceled" }), { status: 200 }),
    ];
    let call = 0;
    const fetchMock = vi.fn(async () => {
      const fn = responses[call++];
      // With the bug present the loop asks for a third response and blows up
      // here, which is a clearer failure than waiting out a real timeout.
      if (!fn) throw new Error(`Polled past the canceled job (fetch call #${call})`);
      return fn();
    }) as unknown as typeof fetch;

    const { server, tools } = capturingServer();
    registerTranscodeAndWait(server, makeClient(fetchMock));

    const origSetTimeout = globalThis.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).setTimeout = (fn: () => void) => origSetTimeout(fn, 0);

    try {
      const result = await tools.get("transcode_and_wait")!.callback({
        inputs: [{ url: "gs://b/x.mp4" }],
        outputFormat: "mp4",
        pollIntervalSeconds: 1,
        timeoutSeconds: 30,
      });
      const body = parseResult(result);
      expect(body.job.status).toBe("canceled");
      // `polls` counts the GETs after creation, so a job canceled on the very
      // first poll gives 1 (the happy-path test above needs two polls to reach
      // completed, hence its 2).
      expect(body.polls).toBe(1);
      expect(body.timedOut).toBeFalsy();
      // No download URL is fetched for a job that never completed.
      expect(body.downloadUrl).toBeNull();
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });

  it("returns timedOut=true when polling exceeds timeout", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ id: "abc", status: "pending" }), { status: 201 });
      }
      return new Response(JSON.stringify({ id: "abc", status: "processing" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { server, tools } = capturingServer();
    registerTranscodeAndWait(server, makeClient(fetchMock));

    const origSetTimeout = globalThis.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).setTimeout = (fn: () => void) => origSetTimeout(fn, 0);

    // Patch Date.now so we "exceed" timeout after the first poll without
    // actually waiting. Date.now is called inside transcodeAndWait for both
    // the start baseline and the elapsed check.
    const realNow = Date.now.bind(Date);
    let nowCalls = 0;
    Date.now = () => {
      nowCalls += 1;
      // First call establishes start=0, all subsequent calls return a large
      // elapsed value so the timeout triggers on the first loop iteration.
      return nowCalls === 1 ? 0 : 10 * 60 * 1000 + 1;
    };

    try {
      const result = await tools.get("transcode_and_wait")!.callback({
        inputs: [{ url: "gs://b/x.mp4" }],
        outputFormat: "mp4",
        timeoutSeconds: 1,
      });
      const body = parseResult(result);
      expect(body.timedOut).toBe(true);
      expect(body.job.status).not.toBe("completed");
    } finally {
      globalThis.setTimeout = origSetTimeout;
      Date.now = realNow;
    }
  });
});

describe("transcribe_audio tool", () => {
  it("creates a transcribe job and returns it as JSON", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr.endsWith("/v1/transcribe")).toBe(true);
      expect(init.method).toBe("POST");
      const body = JSON.parse(String(init.body));
      expect(body.media_url).toBe("gs://b/speech.mp3");
      return new Response(
        JSON.stringify({ id: "tr-1", status: "pending", output_format: "srt" }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerTranscribeAudio(server, makeClient(fetchMock));
    const result = await tools.get("transcribe_audio")!.callback({
      media_url: "gs://b/speech.mp3",
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual({ id: "tr-1", status: "pending", output_format: "srt" });
  });

  it("forwards optional language and task", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({
        media_url: "gs://b/speech.mp3",
        language: "en",
        task: "translate",
      });
      return new Response(JSON.stringify({ id: "tr-2", status: "pending" }), { status: 201 });
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerTranscribeAudio(server, makeClient(fetchMock));
    await tools.get("transcribe_audio")!.callback({
      media_url: "gs://b/speech.mp3",
      language: "en",
      task: "translate",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns an error result when the API errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "bad_media" }), {
        status: 400,
        statusText: "Bad Request",
      }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerTranscribeAudio(server, makeClient(fetchMock));
    const result = await tools.get("transcribe_audio")!.callback({
      media_url: "gs://bad",
    });
    expect(result.isError).toBe(true);
    expect(parseResult(result).status).toBe(400);
  });
});

describe("get_transcribe tool", () => {
  it("fetches a transcribe job by id", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect((typeof url === "string" ? url : url.toString()).endsWith("/v1/transcribe/tr-1")).toBe(true);
      return new Response(
        JSON.stringify({ id: "tr-1", status: "completed", output_url: "gs://out/tr-1.srt" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerGetTranscribe(server, makeClient(fetchMock));
    const result = await tools.get("get_transcribe")!.callback({ id: "tr-1" });
    const body = parseResult(result);
    expect(body.status).toBe("completed");
    expect(body.output_url).toBe("gs://out/tr-1.srt");
  });
});

describe("get_transcribe_download tool", () => {
  it("returns a signed URL for a completed transcribe job", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect((typeof url === "string" ? url : url.toString()).endsWith("/v1/transcribe/tr-1/download")).toBe(true);
      return new Response(
        JSON.stringify({ url: "https://signed.example.com/tr-1.srt" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerGetTranscribeDownload(server, makeClient(fetchMock));
    const result = await tools.get("get_transcribe_download")!.callback({ id: "tr-1" });
    expect(parseResult(result)).toEqual({ url: "https://signed.example.com/tr-1.srt" });
  });

  it("propagates 400 when the job is not completed", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Transcribe not completed" }), {
        status: 400,
        statusText: "Bad Request",
      }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerGetTranscribeDownload(server, makeClient(fetchMock));
    const result = await tools.get("get_transcribe_download")!.callback({ id: "tr-1" });
    expect(result.isError).toBe(true);
    expect(parseResult(result).status).toBe(400);
  });
});

describe("request_upload_url tool", () => {
  it("POSTs to /v1/upload/presigned-url and returns the envelope", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr.endsWith("/v1/upload/presigned-url")).toBe(true);
      expect(init.method).toBe("POST");
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({
        filename: "audio.m4a",
        contentType: "audio/mp4",
        fileSize: 12345,
      });
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            uploadUrl: "https://storage.googleapis.com/signed",
            filename: "1234-audio.m4a",
            expiresAt: "2026-04-28T20:00:00.000Z",
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRequestUploadUrl(server, makeClient(fetchMock));
    const result = await tools.get("request_upload_url")!.callback({
      filename: "audio.m4a",
      contentType: "audio/mp4",
      fileSize: 12345,
    });
    expect(result.isError).toBeFalsy();
    const body = parseResult(result);
    expect(body.success).toBe(true);
    expect(body.result.uploadUrl).toBe("https://storage.googleapis.com/signed");
    expect(body.result.filename).toBe("1234-audio.m4a");
  });

  it("rejects non-positive fileSize via zod", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRequestUploadUrl(server, makeClient(fetchMock));
    const result = await tools.get("request_upload_url")!.callback({
      filename: "audio.m4a",
      contentType: "audio/mp4",
      fileSize: 0,
    });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an error result when the API rejects the file type", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Invalid file type." }), {
        status: 400,
        statusText: "Bad Request",
      }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRequestUploadUrl(server, makeClient(fetchMock));
    const result = await tools.get("request_upload_url")!.callback({
      filename: "x.exe",
      contentType: "application/x-msdownload",
      fileSize: 100,
    });
    expect(result.isError).toBe(true);
    expect(parseResult(result).status).toBe(400);
  });
});

describe("confirm_upload tool", () => {
  it("POSTs to /v1/upload/confirm and returns the gs:// fileUrl", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr.endsWith("/v1/upload/confirm")).toBe(true);
      expect(init.method).toBe("POST");
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({ filename: "1234-audio.m4a", fileSize: 12345 });
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            fileUrl: "gs://bucket/1234-audio.m4a",
            filename: "1234-audio.m4a",
            fileSize: 12345,
            uploadedAt: "2026-04-28T20:00:00.000Z",
            metadata: { duration_seconds: 70 },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerConfirmUpload(server, makeClient(fetchMock));
    const result = await tools.get("confirm_upload")!.callback({
      filename: "1234-audio.m4a",
      fileSize: 12345,
    });
    const body = parseResult(result);
    expect(body.success).toBe(true);
    expect(body.result.fileUrl).toBe("gs://bucket/1234-audio.m4a");
    expect(body.result.metadata.duration_seconds).toBe(70);
  });

  it("forwards optional uploadId", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body));
      expect(body.uploadId).toBe("up-42");
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            fileUrl: "gs://bucket/x",
            filename: "x",
            fileSize: 1,
            uploadedAt: "2026-04-28T20:00:00.000Z",
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerConfirmUpload(server, makeClient(fetchMock));
    await tools.get("confirm_upload")!.callback({
      filename: "x",
      fileSize: 1,
      uploadId: "up-42",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns an error result when the gateway reports a size mismatch", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "File size mismatch" }), {
        status: 400,
        statusText: "Bad Request",
      }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerConfirmUpload(server, makeClient(fetchMock));
    const result = await tools.get("confirm_upload")!.callback({
      filename: "x",
      fileSize: 1,
    });
    expect(result.isError).toBe(true);
    expect(parseResult(result).status).toBe(400);
  });
});

describe("run_blueprint tool", () => {
  it("submits a run and returns the plain (non-envelope) body", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr.endsWith("/v1/blueprints/resize-format/runs")).toBe(true);
      expect(JSON.parse(init!.body as string)).toEqual({
        video_url: "https://example.com/a.mp4",
        format: "9x16",
      });
      return new Response(
        JSON.stringify({ id: "run-1", status: "pending", blueprint: "resize-format", tokens_charged: 0 }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRunBlueprint(server, makeClient(fetchMock));
    const result = await tools.get("run_blueprint")!.callback({
      slug: "resize-format",
      inputs: { video_url: "https://example.com/a.mp4", format: "9x16" },
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual({
      id: "run-1",
      status: "pending",
      blueprint: "resize-format",
      tokens_charged: 0,
    });
  });

  it("rejects unknown slugs before hitting the API", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRunBlueprint(server, makeClient(fetchMock));
    const result = await tools.get("run_blueprint")!.callback({
      slug: "not-a-blueprint",
      inputs: {},
    });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces 402 insufficient_tokens with a help line", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "insufficient_tokens", tokens_required: 200 }), {
        status: 402,
        statusText: "Payment Required",
      }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRunBlueprint(server, makeClient(fetchMock));
    const result = await tools.get("run_blueprint")!.callback({
      slug: "product-ad",
      inputs: { logo_url: "https://x/l.png", photo_url: "https://x/p.png" },
    });
    expect(result.isError).toBe(true);
    const body = parseResult(result);
    expect(body.status).toBe(402);
    expect(body.error).toBe("insufficient_tokens");
    expect(body.tokens_required).toBe(200);
    expect(body.help).toContain("dashboard/blueprints");
  });

  it("surfaces 429 too_many_active_runs with a help line", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "too_many_active_runs", max_active_runs: 2 }), {
        status: 429,
        statusText: "Too Many Requests",
      }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRunBlueprint(server, makeClient(fetchMock));
    const result = await tools.get("run_blueprint")!.callback({
      slug: "product-ad",
      inputs: { logo_url: "https://x/l.png", photo_url: "https://x/p.png" },
    });
    expect(result.isError).toBe(true);
    const body = parseResult(result);
    expect(body.max_active_runs).toBe(2);
    expect(body.help).toContain("Wait for an active run");
  });

  it("surfaces 503 generative_temporarily_unavailable with a help line", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: "generative_temporarily_unavailable", retry_after_minutes: 15 }),
        { status: 503, statusText: "Service Unavailable" },
      ),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRunBlueprint(server, makeClient(fetchMock));
    const result = await tools.get("run_blueprint")!.callback({
      slug: "product-ad",
      inputs: { logo_url: "https://x/l.png", photo_url: "https://x/p.png" },
    });
    expect(result.isError).toBe(true);
    expect(parseResult(result).help).toContain("15");
  });
});

describe("get_blueprint_run tool", () => {
  it("fetches a run by id, including multi-output runs", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr.endsWith("/v1/blueprints/runs/run-2")).toBe(true);
      return new Response(
        JSON.stringify({
          id: "run-2",
          blueprint: "hook-variants",
          status: "completed",
          outputs: [
            { label: "hook1", url: "https://signed/1" },
            { label: "hook2", url: "https://signed/2" },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerGetBlueprintRun(server, makeClient(fetchMock));
    const result = await tools.get("get_blueprint_run")!.callback({ id: "run-2" });
    expect(parseResult(result).outputs).toHaveLength(2);
  });
});

describe("run_blueprint_and_wait tool", () => {
  it("polls until completed", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls += 1;
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({ id: "run-3", status: "pending", blueprint: "resize-format" }),
          { status: 201 },
        );
      }
      return new Response(
        JSON.stringify({
          id: "run-3",
          blueprint: "resize-format",
          status: calls >= 3 ? "completed" : "processing",
          output_url: calls >= 3 ? "https://signed/out.mp4" : null,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRunBlueprintAndWait(server, makeClient(fetchMock));
    const result = await tools.get("run_blueprint_and_wait")!.callback({
      slug: "resize-format",
      inputs: { video_url: "https://example.com/a.mp4" },
      pollIntervalSeconds: 1,
      timeoutSeconds: 30,
    });
    const body = parseResult(result);
    expect(body.run.status).toBe("completed");
    expect(body.run.output_url).toBe("https://signed/out.mp4");
  }, 15_000);

  it("returns early with awaitingReview when the run pauses for transcript review", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({ id: "run-4", status: "pending", blueprint: "caption-video" }),
          { status: 201 },
        );
      }
      return new Response(
        JSON.stringify({
          id: "run-4",
          blueprint: "caption-video",
          status: "awaiting_review",
          srt_text: "1\n00:00:00,000 --> 00:00:01,000\nhello\n",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerRunBlueprintAndWait(server, makeClient(fetchMock));
    const result = await tools.get("run_blueprint_and_wait")!.callback({
      slug: "caption-video",
      inputs: { video_url: "https://example.com/a.mp4" },
      pollIntervalSeconds: 1,
      timeoutSeconds: 30,
    });
    const body = parseResult(result);
    expect(body.awaitingReview).toBe(true);
    expect(body.run.srt_text).toContain("hello");
    expect(body.message).toContain("continue_blueprint_run");
  }, 15_000);
});

describe("continue_blueprint_run tool", () => {
  it("posts the SRT to the continue endpoint", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr.endsWith("/v1/blueprints/runs/run-4/continue")).toBe(true);
      expect(JSON.parse(init!.body as string)).toEqual({ srt_text: "edited srt" });
      return new Response(
        JSON.stringify({ id: "run-4", blueprint: "caption-video", status: "processing" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerContinueBlueprintRun(server, makeClient(fetchMock));
    const result = await tools.get("continue_blueprint_run")!.callback({
      id: "run-4",
      srt_text: "edited srt",
    });
    expect(parseResult(result).status).toBe("processing");
  });
});
