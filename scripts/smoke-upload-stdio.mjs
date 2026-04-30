#!/usr/bin/env node
/**
 * Local stdio smoke test for the request_upload_url + confirm_upload tools.
 *
 * Spawns dist/index.js as an MCP stdio server, lists tools, exercises the
 * full upload flow against the real production API, then chains into
 * transcribe_audio for an end-to-end gut check.
 *
 * Run:
 *   FFMPEG_MICRO_API_KEY=... node scripts/smoke-upload-stdio.mjs <local-file>
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseToolJson(result) {
  if (!result?.content?.[0]?.text) fail(`tool returned no text content: ${JSON.stringify(result)}`);
  return JSON.parse(result.content[0].text);
}

const filePath = process.argv[2];
if (!filePath) fail("usage: smoke-upload-stdio.mjs <local-file>");
if (!process.env.FFMPEG_MICRO_API_KEY) fail("FFMPEG_MICRO_API_KEY is required");

const fileStat = await stat(filePath);
const fileSize = fileStat.size;
const filename = basename(filePath);
const contentType = filename.endsWith(".m4a")
  ? "audio/mp4"
  : filename.endsWith(".mp3")
    ? "audio/mpeg"
    : filename.endsWith(".mp4")
      ? "video/mp4"
      : fail(`unknown extension on ${filename}`);

console.log(`▸ file=${filePath} size=${fileSize} contentType=${contentType}`);

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, FFMPEG_MICRO_API_KEY: process.env.FFMPEG_MICRO_API_KEY },
});
const client = new Client({ name: "smoke-upload", version: "0.0.0" });
await client.connect(transport);
console.log("✓ connected to stdio MCP server");

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log(`✓ tools listed: ${names.join(", ")}`);
for (const required of ["request_upload_url", "confirm_upload"]) {
  if (!names.includes(required)) fail(`missing tool: ${required}`);
}

console.log("▸ calling request_upload_url ...");
const presignRes = parseToolJson(
  await client.callTool({
    name: "request_upload_url",
    arguments: { filename, contentType, fileSize },
  }),
);
if (!presignRes.success) fail(`request_upload_url returned !success: ${JSON.stringify(presignRes)}`);
const { uploadUrl, filename: storageFilename, expiresAt } = presignRes.result;
console.log(`✓ presigned URL ok. storageFilename=${storageFilename} expiresAt=${expiresAt}`);

console.log("▸ PUTting bytes to presigned URL ...");
const bytes = await readFile(filePath);
const putRes = await fetch(uploadUrl, {
  method: "PUT",
  headers: { "Content-Type": contentType },
  body: bytes,
});
if (!putRes.ok) fail(`PUT failed: ${putRes.status} ${putRes.statusText}`);
console.log(`✓ PUT ${putRes.status}`);

console.log("▸ calling confirm_upload ...");
const confirmRes = parseToolJson(
  await client.callTool({
    name: "confirm_upload",
    arguments: { filename: storageFilename, fileSize },
  }),
);
if (!confirmRes.success) fail(`confirm_upload returned !success: ${JSON.stringify(confirmRes)}`);
const { fileUrl, metadata } = confirmRes.result;
if (!fileUrl?.startsWith("gs://")) fail(`expected gs:// URL, got ${fileUrl}`);
console.log(`✓ confirm ok. fileUrl=${fileUrl}`);
console.log(`  metadata: ${JSON.stringify(metadata ?? {})}`);

console.log("▸ chaining into transcribe_audio ...");
const transcribeRes = parseToolJson(
  await client.callTool({
    name: "transcribe_audio",
    arguments: { media_url: fileUrl, language: "en" },
  }),
);
console.log(`✓ transcribe job queued: id=${transcribeRes.id} status=${transcribeRes.status}`);

await client.close();
console.log("\n✅ ALL CHECKS PASSED — request_upload_url + confirm_upload work end-to-end via stdio.");
