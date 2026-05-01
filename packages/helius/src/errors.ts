export type HeliusErrorContext = Record<string, unknown>;

export class HeliusError extends Error {
  readonly code: string;
  readonly context?: HeliusErrorContext;
  constructor(code: string, message: string, context?: HeliusErrorContext) {
    super(message);
    this.name = "HeliusError";
    this.code = code;
    this.context = context;
  }
}

export class HeliusRateLimitError extends HeliusError {
  constructor(context?: HeliusErrorContext) {
    super("HELIUS_RATE_LIMITED", "Helius rate limit exceeded after retries", context);
    this.name = "HeliusRateLimitError";
  }
}

export class HeliusServerError extends HeliusError {
  constructor(status: number, body: string, context?: HeliusErrorContext) {
    super("HELIUS_SERVER_ERROR", `Helius ${status}: ${body.slice(0, 200)}`, context);
    this.name = "HeliusServerError";
  }
}

export class HeliusNetworkError extends HeliusError {
  constructor(cause: unknown, context?: HeliusErrorContext) {
    super(
      "HELIUS_NETWORK_ERROR",
      `Helius network error: ${cause instanceof Error ? cause.message : String(cause)}`,
      context,
    );
    this.name = "HeliusNetworkError";
  }
}
