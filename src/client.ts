import type {
  CancelTranscodeResponse,
  CreateTranscodeRequest,
  CreateTranscribeRequest,
  DownloadUrlResponse,
  ListTranscodesResponse,
  Transcode,
  TranscodeStatus,
  Transcribe,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.ffmpeg-micro.com";

export interface FFmpegMicroClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Injectable for testing. Defaults to global fetch. */
  fetch?: typeof fetch;
  /** User-Agent header value. */
  userAgent?: string;
}

export class FFmpegMicroApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`FFmpeg Micro API ${method} ${path} failed: ${status} ${statusText}${body ? ` — ${body}` : ""}`);
    this.name = "FFmpegMicroApiError";
  }
}

export interface ListTranscodesParams {
  status?: TranscodeStatus;
  page?: number;
  limit?: number;
  since?: string;
  until?: string;
}

/**
 * Thin typed wrapper around the FFmpeg Micro REST API. Keeps the surface area
 * focused on what the MCP tools need; does not try to be a general SDK.
 */
export class FFmpegMicroClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly userAgent: string;

  constructor(options: FFmpegMicroClientOptions) {
    if (!options.apiKey) {
      throw new Error("FFmpegMicroClient: apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchFn = options.fetch ?? fetch;
    this.userAgent = options.userAgent ?? "ffmpeg-micro-mcp";
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      let text = "";
      try {
        text = await res.text();
      } catch {
        // ignore body read errors; the status is enough for the error
      }
      throw new FFmpegMicroApiError(method, path, res.status, res.statusText, text);
    }

    // A few endpoints return JSON; the request helper is only used for those.
    return (await res.json()) as T;
  }

  createTranscode(body: CreateTranscodeRequest): Promise<Transcode> {
    return this.request<Transcode>("POST", "/v1/transcodes", body);
  }

  getTranscode(id: string): Promise<Transcode> {
    return this.request<Transcode>("GET", `/v1/transcodes/${encodeURIComponent(id)}`);
  }

  listTranscodes(params: ListTranscodesParams = {}): Promise<ListTranscodesResponse> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.since) query.set("since", params.since);
    if (params.until) query.set("until", params.until);
    const qs = query.toString();
    return this.request<ListTranscodesResponse>("GET", `/v1/transcodes${qs ? `?${qs}` : ""}`);
  }

  cancelTranscode(id: string): Promise<CancelTranscodeResponse> {
    return this.request<CancelTranscodeResponse>("PATCH", `/v1/transcodes/${encodeURIComponent(id)}/cancel`);
  }

  getDownloadUrl(id: string): Promise<DownloadUrlResponse> {
    return this.request<DownloadUrlResponse>(
      "GET",
      `/v1/transcodes/${encodeURIComponent(id)}/download?url=true`,
    );
  }

  createTranscribe(body: CreateTranscribeRequest): Promise<Transcribe> {
    return this.request<Transcribe>("POST", "/v1/transcribe", body);
  }

  getTranscribe(id: string): Promise<Transcribe> {
    return this.request<Transcribe>("GET", `/v1/transcribe/${encodeURIComponent(id)}`);
  }

  getTranscribeDownloadUrl(id: string): Promise<DownloadUrlResponse> {
    return this.request<DownloadUrlResponse>(
      "GET",
      `/v1/transcribe/${encodeURIComponent(id)}/download`,
    );
  }
}
