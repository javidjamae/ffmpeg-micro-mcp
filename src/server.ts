/**
 * HTTP server entry point for Vercel (and local `npm run serve`).
 *
 * Vercel's @vercel/node runtime accepts an exported Express app as the default
 * export and wraps it as a serverless function automatically.
 *
 * For local development, set PORT (default 3000) and run:
 *   npm run build && npm run serve
 */
import { createApp } from "./http.js";

const app = createApp();

// When run directly (local dev), start listening.
// Vercel imports this module and uses the default export instead.
if (process.env.VERCEL !== "1") {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    process.stdout.write(`ffmpeg-micro-mcp HTTP server listening on port ${port}\n`);
    process.stdout.write(`MCP endpoint: http://localhost:${port}/\n`);
  });
}

export default app;
