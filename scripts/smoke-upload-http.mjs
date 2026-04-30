#!/usr/bin/env node
/**
 * HTTP MCP smoke test for the request_upload_url + confirm_upload tools.
 *
 * Connects to a deployed (or local) HTTP MCP server using a Bearer API key,
 * lists tools, and exercises the full upload flow end-to-end.
 *
 * Run:
 *   FFMPEG_MICRO_API_KEY=... MCP_URL=https://...vercel.app node scripts/smoke-upload-http.mjs <local-file>
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
if (!filePath) fail("usage: smoke-upload-http.mjs <local-file>");
if (!process.env.FFMPEG_MICRO_API_KEY) fail("FFMPEG_MICRO_API_KEY is required");
if (!process.env.MCP_URL) fail("MCP_URL is required");

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

console.log(`▸ MCP_URL=${process.env.MCP_URL}`);
console.log(`▸ file=${filePath} size=${fileSize} contentType=${contentType}`);

const transport = new StreamableHTTPClientTransport(new URL(process.env.MCP_URL), {
  requestInit: {
    headers: { Authorization: `Bearer ${process.env.FFMPEG_MICRO_API_KEY}` },
  },
});
const client = new Client({ name: "smoke-upload-http", version: "0.0.0" });
await client.connect(transport);
console.log("✓ connected to HTTP MCP server");

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log(`✓ tools listed (${names.length}): ${names.join(", ")}`);
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
const { uploadUrl, filename: storageFilename } = presignRes.result;
console.log(`✓ presigned URL ok. storageFilename=${storageFilename}`);

console.log("▸ PUTting bytes ...");
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

await client.close();
console.log("\n✅ ALL CHECKS PASSED — request_upload_url + confirm_upload work end-to-end via HTTP.");
