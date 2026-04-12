import { FFmpegMicroApiError } from "../client.js";

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  // The MCP SDK's CallToolResult type carries an index signature; matching it
  // here lets our tool handlers be passed directly to server.registerTool().
  [key: string]: unknown;
}

/** Wraps a JSON-serializable value in the MCP text-content envelope. */
export function jsonResult(value: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

/**
 * Converts thrown errors into an MCP error result. Keeps the API-specific
 * information (status, endpoint, body) in the text so the LLM can react.
 */
export function errorResult(error: unknown): McpToolResult {
  if (error instanceof FFmpegMicroApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "ffmpeg_micro_api_error",
              method: error.method,
              path: error.path,
              status: error.status,
              statusText: error.statusText,
              body: error.body,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: "internal_error", message }, null, 2),
      },
    ],
  };
}
