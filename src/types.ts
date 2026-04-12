/**
 * Type definitions mirroring the FFmpeg Micro REST API (see specs/openapi.yaml).
 * These are hand-maintained rather than generated for v0.1.0 to keep the repo
 * simple. They can be switched to openapi-typescript output later if the API
 * surface grows.
 */

export type TranscodeStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export type OutputFormat = "mp4" | "webm" | "mov";
export type QualityPreset = "high" | "medium" | "low";
export type ResolutionPreset = "480p" | "720p" | "1080p" | "4k";

export interface Input {
  url: string;
}

export interface Preset {
  quality?: QualityPreset;
  resolution?: ResolutionPreset;
}

export interface FfmpegOption {
  option: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  argument: string | Record<string, any>;
}

export interface CreateTranscodeRequest {
  inputs: Input[];
  outputFormat: OutputFormat;
  preset?: Preset;
  options?: FfmpegOption[];
}

export interface Transcode {
  id: string;
  status: TranscodeStatus;
  output_format?: string;
  output_url?: string | null;
  created_at: string;
  updated_at?: string;
  duration_seconds?: number;
  billable_minutes?: number;
  // Passthrough for everything the server returns — we don't want to drop fields.
  [key: string]: unknown;
}

export interface ListTranscodesResponse {
  items: Transcode[];
  page: number;
  limit: number;
  total: number;
}

export interface CancelTranscodeResponse {
  success: boolean;
  message: string;
  job: Transcode;
}

export interface DownloadUrlResponse {
  url: string;
}
