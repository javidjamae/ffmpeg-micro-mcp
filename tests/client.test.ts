import { describe, it, expect, vi } from "vitest";
import { FFmpegMicroClient, FFmpegMicroApiError } from "../src/client.js";

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    return handler(urlStr, init);
  }) as unknown as typeof fetch;
}

describe("FFmpegMicroClient", () => {
  it("requires an apiKey", () => {
    expect(() => new FFmpegMicroClient({ apiKey: "" })).toThrow(/apiKey is required/);
  });

  it("uses the production base URL by default", async () => {
    const fetchMock = mockFetch((url) => {
      expect(url).toBe("https://api.ffmpeg-micro.com/v1/transcodes/abc");
      return new Response(JSON.stringify({ id: "abc", status: "queued" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new FFmpegMicroClient({ apiKey: "k", fetch: fetchMock });
    const job = await client.getTranscode("abc");
    expect(job.id).toBe("abc");
  });

  it("overrides base URL from options and strips trailing slashes", async () => {
    const fetchMock = mockFetch((url) => {
      expect(url).toBe("http://localhost:8081/v1/transcodes/abc");
      return new Response(JSON.stringify({ id: "abc", status: "queued" }), { status: 200 });
    });
    const client = new FFmpegMicroClient({
      apiKey: "k",
      baseUrl: "http://localhost:8081///",
      fetch: fetchMock,
    });
    await client.getTranscode("abc");
  });

  it("sends bearer auth and JSON content-type for POST requests", async () => {
    const fetchMock = mockFetch((_url, init) => {
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer my-key");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init.body).toBe(
        JSON.stringify({ inputs: [{ url: "gs://b/x.mp4" }], outputFormat: "mp4" }),
      );
      return new Response(JSON.stringify({ id: "abc", status: "queued" }), { status: 201 });
    });
    const client = new FFmpegMicroClient({ apiKey: "my-key", fetch: fetchMock });
    await client.createTranscode({
      inputs: [{ url: "gs://b/x.mp4" }],
      outputFormat: "mp4",
    });
  });

  it("throws FFmpegMicroApiError on non-2xx responses", async () => {
    const fetchMock = mockFetch(() =>
      new Response(JSON.stringify({ error: "quota exceeded" }), {
        status: 402,
        statusText: "Payment Required",
      }),
    );
    const client = new FFmpegMicroClient({ apiKey: "k", fetch: fetchMock });
    await expect(client.createTranscode({ inputs: [{ url: "x" }], outputFormat: "mp4" })).rejects.toThrow(
      FFmpegMicroApiError,
    );
  });

  it("encodes the id path segment in getTranscode", async () => {
    const fetchMock = mockFetch((url) => {
      expect(url).toBe("https://api.ffmpeg-micro.com/v1/transcodes/has%2Fslash");
      return new Response(JSON.stringify({ id: "has/slash", status: "queued" }), { status: 200 });
    });
    const client = new FFmpegMicroClient({ apiKey: "k", fetch: fetchMock });
    await client.getTranscode("has/slash");
  });

  it("builds list query strings with only provided filters", async () => {
    const fetchMock = mockFetch((url) => {
      expect(url).toBe("https://api.ffmpeg-micro.com/v1/transcodes?status=completed&page=2&limit=50");
      return new Response(JSON.stringify({ items: [], page: 2, limit: 50, total: 0 }), { status: 200 });
    });
    const client = new FFmpegMicroClient({ apiKey: "k", fetch: fetchMock });
    await client.listTranscodes({ status: "completed", page: 2, limit: 50 });
  });

  it("list without params sends no query string", async () => {
    const fetchMock = mockFetch((url) => {
      expect(url).toBe("https://api.ffmpeg-micro.com/v1/transcodes");
      return new Response(JSON.stringify({ items: [], page: 1, limit: 20, total: 0 }), { status: 200 });
    });
    const client = new FFmpegMicroClient({ apiKey: "k", fetch: fetchMock });
    await client.listTranscodes();
  });

  it("cancelTranscode sends PATCH with no body", async () => {
    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe("https://api.ffmpeg-micro.com/v1/transcodes/abc/cancel");
      expect(init.method).toBe("PATCH");
      expect(init.body).toBeUndefined();
      const headers = new Headers(init.headers);
      expect(headers.get("Content-Type")).toBeNull();
      return new Response(
        JSON.stringify({ success: true, message: "Job cancelled successfully", job: { id: "abc", status: "cancelled" } }),
        { status: 200 },
      );
    });
    const client = new FFmpegMicroClient({ apiKey: "k", fetch: fetchMock });
    const result = await client.cancelTranscode("abc");
    expect(result.success).toBe(true);
  });

  it("getDownloadUrl hits the download endpoint with url=true", async () => {
    const fetchMock = mockFetch((url) => {
      expect(url).toBe("https://api.ffmpeg-micro.com/v1/transcodes/abc/download?url=true");
      return new Response(JSON.stringify({ url: "https://signed.example/abc" }), { status: 200 });
    });
    const client = new FFmpegMicroClient({ apiKey: "k", fetch: fetchMock });
    const result = await client.getDownloadUrl("abc");
    expect(result.url).toBe("https://signed.example/abc");
  });
});
