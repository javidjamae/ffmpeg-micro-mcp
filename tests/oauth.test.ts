import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import http from "http";
import { createApp } from "../src/http.js";

/** Make an HTTP request using Node's http module (avoids global fetch mock). */
function httpRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: data })
        );
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function json(body: string) {
  try { return JSON.parse(body); } catch { return null; }
}

// Start the Express app on a random port
let server: http.Server;
let baseUrl: string;

const app = createApp();
server = app.listen(0);
const addr = server.address() as { port: number };
baseUrl = `http://127.0.0.1:${addr.port}`;

afterAll(() => {
  server.close();
});

// Mock global fetch to intercept proxy calls from Express to the gateway.
// Test HTTP requests use the httpRequest helper (Node http module) so they
// aren't affected by this mock.
const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OAuth endpoints", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ─── Authorization Server Metadata ──────────────────────────────────

  describe("GET /.well-known/oauth-authorization-server", () => {
    it("returns metadata pointing to this server's endpoints", async () => {
      const res = await httpRequest(
        `${baseUrl}/.well-known/oauth-authorization-server`
      );
      expect(res.status).toBe(200);
      const body = json(res.body);
      expect(body.issuer).toBeDefined();
      expect(body.authorization_endpoint).toContain("/oauth/authorize");
      expect(body.token_endpoint).toContain("/oauth/token");
      expect(body.registration_endpoint).toContain("/oauth/register");
      expect(body.response_types_supported).toEqual(["code"]);
      expect(body.code_challenge_methods_supported).toEqual(["S256"]);

      // All endpoints must be on the same host (MCP spec requirement)
      const issuer = body.issuer;
      expect(body.authorization_endpoint.startsWith(issuer)).toBe(true);
      expect(body.token_endpoint.startsWith(issuer)).toBe(true);
      expect(body.registration_endpoint.startsWith(issuer)).toBe(true);
    });
  });

  // ─── Protected Resource Metadata ────────────────────────────────────

  describe("GET /.well-known/oauth-protected-resource", () => {
    it("points authorization_servers to self", async () => {
      const res = await httpRequest(
        `${baseUrl}/.well-known/oauth-protected-resource`
      );
      expect(res.status).toBe(200);
      const body = json(res.body);
      expect(body.resource).toBeDefined();
      expect(body.authorization_servers[0]).toBe(body.resource);
    });
  });

  // ─── Dynamic Client Registration ───────────────────────────────────

  describe("POST /oauth/register", () => {
    it("proxies registration to the gateway", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          client_id: "abc123",
          client_name: "Test Agent",
          redirect_uris: ["http://localhost/cb"],
        }),
      });

      const res = await httpRequest(`${baseUrl}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Test Agent",
          redirect_uris: ["http://localhost/cb"],
        }),
      });

      expect(res.status).toBe(201);
      expect(json(res.body).client_id).toBe("abc123");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/oauth/register"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("forwards errors from gateway", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 400,
        json: async () => ({ error: "invalid_client_metadata" }),
      });

      const res = await httpRequest(`${baseUrl}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(400);
    });

    it("returns 502 on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("connection refused"));

      const res = await httpRequest(`${baseUrl}/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "X", redirect_uris: ["http://localhost/cb"] }),
      });
      expect(res.status).toBe(502);
    });
  });

  // ─── Authorization Redirect ─────────────────────────────────────────

  describe("GET /oauth/authorize", () => {
    it("redirects to gateway with all query params", async () => {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: "abc",
        redirect_uri: "http://localhost/cb",
        code_challenge: "challenge123",
        state: "mystate",
      });
      const res = await httpRequest(`${baseUrl}/oauth/authorize?${params}`);

      expect(res.status).toBe(302);
      const location = new URL(res.headers.location as string);
      expect(location.pathname).toBe("/oauth/authorize");
      expect(location.searchParams.get("client_id")).toBe("abc");
      expect(location.searchParams.get("code_challenge")).toBe("challenge123");
      expect(location.searchParams.get("state")).toBe("mystate");
    });
  });

  // ─── Token Exchange ─────────────────────────────────────────────────

  describe("POST /oauth/token", () => {
    it("proxies token exchange to the gateway", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ access_token: "ffm_abc123", token_type: "Bearer" }),
      });

      const res = await httpRequest(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "authcode123",
          code_verifier: "verifier123",
          client_id: "abc",
        }),
      });

      expect(res.status).toBe(200);
      const body = json(res.body);
      expect(body.access_token).toBe("ffm_abc123");
      expect(body.token_type).toBe("Bearer");
    });

    it("forwards errors from gateway", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 400,
        json: async () => ({ error: "invalid_grant" }),
      });

      const res = await httpRequest(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code", code: "bad", code_verifier: "wrong", client_id: "abc" }),
      });
      expect(res.status).toBe(400);
      expect(json(res.body).error).toBe("invalid_grant");
    });

    it("returns 502 on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("timeout"));

      const res = await httpRequest(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code", code: "x", code_verifier: "y", client_id: "z" }),
      });
      expect(res.status).toBe(502);
    });
  });

  // ─── 401 on unauthenticated MCP request ─────────────────────────────

  describe("MCP endpoint auth", () => {
    it("returns 401 without Bearer token", async () => {
      const res = await httpRequest(`${baseUrl}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });
      expect(res.status).toBe(401);
    });
  });
});
