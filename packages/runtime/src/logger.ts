// Minimal structured logger — pino-compatible surface so we can swap later.
// JSON in prod, pretty-ish in dev. No external dep.

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const levelFromEnv = (): Level => {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
};

const minLevel = LEVEL_RANK[levelFromEnv()];
const isProd = process.env.NODE_ENV === "production";

type Bindings = Record<string, unknown>;

export type Logger = {
  debug(obj: Bindings | string, msg?: string): void;
  info(obj: Bindings | string, msg?: string): void;
  warn(obj: Bindings | string, msg?: string): void;
  error(obj: Bindings | string, msg?: string): void;
  child(bindings: Bindings): Logger;
};

function emit(level: Level, base: Bindings, arg1: Bindings | string, msg?: string): void {
  if (LEVEL_RANK[level] < minLevel) return;

  let body: Bindings;
  let message: string | undefined;
  if (typeof arg1 === "string") {
    body = base;
    message = arg1;
  } else {
    body = { ...base, ...arg1 };
    message = msg;
  }

  const entry = {
    level,
    time: new Date().toISOString(),
    ...body,
    ...(message !== undefined ? { msg: message } : {}),
  };

  if (isProd) {
    process.stdout.write(JSON.stringify(entry, replacer) + "\n");
  } else {
    const tag = `[${entry.level.toUpperCase()}]`;
    const tail = Object.fromEntries(
      Object.entries(entry).filter(([k]) => k !== "level" && k !== "time" && k !== "msg"),
    );
    const tailStr = Object.keys(tail).length > 0 ? " " + JSON.stringify(tail, replacer) : "";
    process.stdout.write(`${tag} ${entry.time} ${message ?? ""}${tailStr}\n`);
  }
}

function replacer(_k: string, v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Error) {
    return { name: v.name, message: v.message, stack: v.stack };
  }
  return v;
}

function makeLogger(base: Bindings): Logger {
  return {
    debug: (a, m) => emit("debug", base, a, m),
    info: (a, m) => emit("info", base, a, m),
    warn: (a, m) => emit("warn", base, a, m),
    error: (a, m) => emit("error", base, a, m),
    child: (bindings) => makeLogger({ ...base, ...bindings }),
  };
}

export const logger: Logger = makeLogger({});

export function createLogger(bindings: Bindings = {}): Logger {
  return makeLogger(bindings);
}
