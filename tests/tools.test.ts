import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FFmpegMicroClient } from "../src/client.js";
import { registerTranscodeVideo } from "../src/tools/transcodeVideo.js";
import { registerGetTranscode } from "../src/tools/getTranscode.js";
import { registerListTranscodes } from "../src/tools/listTranscodes.js";
import { registerCancelTranscode } from "../src/tools/cancelTranscode.js";
import { registerGetDownloadUrl } from "../src/tools/getDownloadUrl.js";
import { registerTranscodeAndWait } from "../src/tools/transcodeAndWait.js";

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
      new Response(JSON.stringify({ id: "job-1", status: "queued" }), { status: 201 }),
    ) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerTranscodeVideo(server, makeClient(fetchMock));
    const tool = tools.get("transcode_video")!;

    const result = await tool.callback({
      inputs: [{ url: "gs://b/x.mp4" }],
      outputFormat: "mp4",
    });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual({ id: "job-1", status: "queued" });
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
        JSON.stringify({ success: true, message: "Job cancelled successfully", job: { id: "abc", status: "cancelled" } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const { server, tools } = capturingServer();
    registerCancelTranscode(server, makeClient(fetchMock));
    const result = await tools.get("cancel_transcode")!.callback({ id: "abc" });
    const body = parseResult(result);
    expect(body.success).toBe(true);
    expect(body.job.status).toBe("cancelled");
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
      () => new Response(JSON.stringify({ id: "abc", status: "queued" }), { status: 201 }),
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

  it("returns timedOut=true when polling exceeds timeout", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ id: "abc", status: "queued" }), { status: 201 });
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
