import { pino, type DestinationStream } from "pino";
import type { AppConfig } from "../config/config.js";
import { getRequestContext } from "./requestContext.js";

export type LogMetadata = Record<string, unknown>;

export type Logger = {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
};

const RESERVED_FIELDS = ["timestamp", "level", "message"];

const withoutReservedFields = (metadata: LogMetadata): LogMetadata =>
  Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !RESERVED_FIELDS.includes(key)),
  );

export const createLogger = (
  config: AppConfig["logging"],
  destination?: DestinationStream,
): Logger => {
  const logger = pino(
    {
      level: config.level,
      base: null,
      messageKey: "message",
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: {
        level: (level) => ({ level }),
        log: withoutReservedFields,
      },
      serializers: {
        error: pino.stdSerializers.err,
      },
      // Adds the current request ID to every log line written during a request.
      mixin: () => ({ ...getRequestContext() }),
    },
    destination,
  );

  return {
    info: (message, metadata = {}) => {
      logger.info(metadata, message);
    },

    warn: (message, metadata = {}) => {
      logger.warn(metadata, message);
    },

    error: (message, metadata = {}) => {
      logger.error(metadata, message);
    },
  };
};
