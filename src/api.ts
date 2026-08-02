import type { Config } from "./config.js";
import { authHeaders } from "./auth.js";
import { logger } from "./logger.js";
import type { ExecuteRequest, ExecuteResponse, ToolsListResponse } from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export class McpgramApi {
  constructor(private readonly config: Config) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        logger.debug(`${method} ${url}`, { attempt });
        const res = await fetch(url, {
          method,
          headers: authHeaders(this.config),
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const text = await res.text();
        let json: unknown = null;
        if (text) {
          try {
            json = JSON.parse(text);
          } catch {
            json = { raw: text };
          }
        }

        if (!res.ok) {
          if (isRetryable(res.status) && attempt < this.config.maxRetries) {
            const retryAfter = Number(res.headers.get("retry-after") ?? "0");
            const backoff =
              retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 8000);
            logger.warn(`Retryable HTTP ${res.status}, backing off ${backoff}ms`, {
              path,
              attempt,
            });
            await sleep(backoff);
            continue;
          }
          const msg =
            (json as { error?: string } | null)?.error ?? `HTTP ${res.status} from MCPGRAM`;
          throw new ApiError(msg, res.status, json);
        }

        return json as T;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.config.maxRetries) {
          const backoff = Math.min(1000 * 2 ** attempt, 8000);
          logger.warn(`Network error, retrying in ${backoff}ms`, {
            path,
            error: lastError.message,
          });
          await sleep(backoff);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new Error("Request failed");
  }

  listTools(serverFilter?: string): Promise<ToolsListResponse> {
    const qs = serverFilter ? `?server=${encodeURIComponent(serverFilter)}` : "";
    return this.request<ToolsListResponse>("GET", `/api/v1/tools${qs}`);
  }

  execute(req: ExecuteRequest): Promise<ExecuteResponse> {
    return this.request<ExecuteResponse>("POST", "/api/v1/execute", req);
  }

  listMcpServers(): Promise<{
    workspace_id: string;
    servers: Array<{
      server_id: string;
      name: string;
      url: string;
      status: string;
      tool_count: number;
      provider_type: string;
    }>;
  }> {
    return this.request("GET", "/api/v1/mcp-servers");
  }

  connectMcpServer(body: {
    url: string;
    name?: string;
    authentication?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    return this.request("POST", "/api/v1/mcp-servers", body);
  }

  disconnectMcpServer(serverId: string): Promise<Record<string, unknown>> {
    return this.request("DELETE", `/api/v1/mcp-servers/${encodeURIComponent(serverId)}`);
  }

  refreshMcpServer(serverId: string): Promise<Record<string, unknown>> {
    return this.request("POST", `/api/v1/mcp-servers/${encodeURIComponent(serverId)}`);
  }

  async validateKey(): Promise<boolean> {
    try {
      await this.listTools();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false;
      return true;
    }
  }
}
