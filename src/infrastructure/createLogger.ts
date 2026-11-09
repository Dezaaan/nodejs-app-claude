export type LogMetadata = Record<string, unknown>;

export type Logger = {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
};

type LogLevel = "info" | "warn" | "error";

// JSON.stringify drops an Error's message and stack (they are non-enumerable).
const serializeErrors = (_key: string, value: unknown): unknown => {
  if (!(value instanceof Error)) {
    return value;
  }

  return {
    ...value,
    name: value.name,
    message: value.message,
    stack: value.stack,
    ...(value.cause !== undefined && { cause: value.cause }),
  };
};

const log = (
  level: LogLevel,
  message: string,
  metadata?: LogMetadata,
): void => {
  // Metadata goes first so it can't overwrite the reserved fields.
  const entry = {
    ...metadata,
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  const serialized = JSON.stringify(entry, serializeErrors);

  switch (level) {
    case "error":
      console.error(serialized);
      break;

    case "warn":
      console.warn(serialized);
      break;

    default:
      console.log(serialized);
  }
};

export const createLogger = (): Logger => ({
  info: (message, metadata) => {
    log("info", message, metadata);
  },

  warn: (message, metadata) => {
    log("warn", message, metadata);
  },

  error: (message, metadata) => {
    log("error", message, metadata);
  },
});
