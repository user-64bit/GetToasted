import { getApiUrl } from "../api-url";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

type JsonInit = Omit<RequestInit, "body"> & { body?: unknown };

export async function apiFetch<T>(path: string, init: JsonInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;

  const res = await fetch(getApiUrl(path), {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const parsed: unknown = text ? safeJsonParse(text) : undefined;

  if (!res.ok) {
    const errBody = (parsed ?? {}) as {
      error?: string;
      code?: string;
      // Non-prod API responses include a `detail` field with the
      // underlying error message. Surface it in the thrown ApiError so
      // the dashboard can show e.g. "column foo does not exist" instead
      // of just "internal_server_error".
      detail?: string;
    };
    const baseMessage = errBody.error ?? `HTTP ${res.status}`;
    const message = errBody.detail
      ? `${baseMessage}: ${errBody.detail}`
      : baseMessage;
    throw new ApiError(res.status, message, errBody.code);
  }

  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
