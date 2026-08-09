#!/usr/bin/env node
/**
 * Local stdio smoke test for the blueprint tools.
 *
 * Spawns dist/index.js as an MCP stdio server, lists tools, then exercises:
 *   1. run_blueprint (resize-format) + get_blueprint_run polled to completion
 *   2. run_blueprint_and_wait (hook-variants) to exercise multi-output
 *
 * Run:
 *   FFMPEG_MICRO_API_KEY=... node scripts/smoke-blueprints-stdio.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SAMPLE_VIDEO =
  "https://armraisxutpljvgttkne.supabase.co/storage/v1/object/public/public-assets/blueprints/caption-video-example.mp4";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseToolJson(result) {
  if (!result?.content?.[0]?.text) fail(`tool returned no text content: ${JSON.stringify(result)}`);
  return JSON.parse(result.content[0].text);
}

if (!process.env.FFMPEG_MICRO_API_KEY) fail("FFMPEG_MICRO_API_KEY is required");

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, FFMPEG_MICRO_API_KEY: process.env.FFMPEG_MICRO_API_KEY },
});
const client = new Client({ name: "smoke-blueprints", version: "0.0.0" });
await client.connect(transport);
console.log("✓ connected to stdio MCP server");

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log(`✓ tools listed: ${names.join(", ")}`);
for (const required of [
  "run_blueprint",
  "get_blueprint_run",
  "run_blueprint_and_wait",
  "continue_blueprint_run",
]) {
  if (!names.includes(required)) fail(`missing tool: ${required}`);
}

// ── 1. run_blueprint + get_blueprint_run (resize-format) ─────────────────
console.log("▸ run_blueprint resize-format ...");
const created = parseToolJson(
  await client.callTool({
    name: "run_blueprint",
    arguments: { slug: "resize-format", inputs: { video_url: SAMPLE_VIDEO, format: "1x1" } },
  }),
);
if (!created.id) fail(`run_blueprint returned no id: ${JSON.stringify(created)}`);
console.log(`✓ run created: id=${created.id} status=${created.status} tokens_charged=${created.tokens_charged}`);

let run = created;
const deadline = Date.now() + 10 * 60 * 1000;
while (!["completed", "failed"].includes(run.status)) {
  if (Date.now() > deadline) fail(`timed out waiting for run ${created.id} (status=${run.status})`);
  await new Promise((r) => setTimeout(r, 5000));
  run = parseToolJson(
    await client.callTool({ name: "get_blueprint_run", arguments: { id: created.id } }),
  );
  console.log(`  … status=${run.status} step=${run.step ?? "-"}`);
}
if (run.status !== "completed") fail(`run failed: ${run.error_message}`);
if (!run.output_url) fail("completed run has no output_url");
console.log(`✓ resize-format completed. output_url=${run.output_url.slice(0, 80)}...`);

// ── 2. run_blueprint_and_wait (hook-variants, multi-output) ──────────────
console.log("▸ run_blueprint_and_wait hook-variants (multi-output) ...");
// The SDK client defaults to a 60s request timeout; this tool call blocks for
// the whole run, so give it headroom beyond the tool's own timeoutSeconds.
const waited = parseToolJson(
  await client.callTool(
    {
      name: "run_blueprint_and_wait",
      arguments: {
        slug: "hook-variants",
        inputs: { video_url: SAMPLE_VIDEO, hook1: "Wait for it...", hook2: "You won't believe this" },
        timeoutSeconds: 600,
      },
    },
    undefined,
    { timeout: 11 * 60 * 1000 },
  ),
);
if (waited.timedOut) fail(`hook-variants timed out: ${JSON.stringify(waited.run?.status)}`);
if (waited.run?.status !== "completed") fail(`hook-variants run not completed: ${JSON.stringify(waited.run)}`);
const outputs = waited.run.outputs;
if (!Array.isArray(outputs) || outputs.length < 2) {
  fail(`expected ≥2 labeled outputs, got: ${JSON.stringify(outputs)}`);
}
console.log(`✓ hook-variants completed with ${outputs.length} outputs:`);
for (const o of outputs) console.log(`  - ${o.label}: ${o.url.slice(0, 70)}...`);

await client.close();
console.log("\n✅ ALL CHECKS PASSED — blueprint tools work end-to-end via stdio against the real API.");
