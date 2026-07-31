import type { LogLevel } from "./types.js";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * All logs go to stderr. stdout is reserved for MCP JSON-RPC over stdio.
 */
export class Logger {
  constructor(private level: LogLevel = "info") {}

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private write(level: LogLevel, message: string, meta?: unknown) {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const ts = new Date().toISOString();
    const line =
      meta !== undefined
        ? `[${ts}] [mcpgram-mcp] [${level}] ${message} ${safeJson(meta)}`
        : `[${ts}] [mcpgram-mcp] [${level}] ${message}`;
    process.stderr.write(line + "\n");
  }

  debug(message: string, meta?: unknown) {
    this.write("debug", message, meta);
  }
  info(message: string, meta?: unknown) {
    this.write("info", message, meta);
  }
  warn(message: string, meta?: unknown) {
    this.write("warn", message, meta);
  }
  error(message: string, meta?: unknown) {
    this.write("error", message, meta);
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = new Logger();
