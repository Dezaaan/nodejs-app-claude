import { createClient } from "redis";

import type { AppConfig } from "../../config/config.js";
import type { Logger } from "../createLogger.js";

export type Redis = {
  // Fails if Redis can't be reached, so the app doesn't start without it.
  connect(): Promise<void>;

  // Sends a raw command, such as ["GET", "key"].
  sendCommand(args: string[]): Promise<unknown>;

  healthCheck(): Promise<void>;

  close(): Promise<void>;
};

const CONNECT_TIMEOUT_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 3_000;

export const createRedis = (
  config: AppConfig["redis"],
  logger: Logger,
): Redis => {
  let hasConnected = false;
  // Errors are logged once per outage, not on every reconnect attempt.
  let isDown = false;

  const client = createClient({
    url: config.url,
    // Commands fail at once while disconnected instead of waiting in a queue,
    // so a Redis outage can't make requests hang.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      // The first connection fails fast; after that, keep retrying with a
      // growing delay for as long as Redis is down.
      reconnectStrategy: (retries, cause) =>
        hasConnected
          ? Math.min(100 * 2 ** retries, MAX_RECONNECT_DELAY_MS)
          : cause,
    },
  });

  // Without a listener, a connection error crashes the process.
  client.on("error", (error: unknown) => {
    // Before the first connection, connect() reports the error instead.
    if (hasConnected && !isDown) {
      isDown = true;
      logger.error("Redis connection lost", { error });
    }
  });

  client.on("ready", () => {
    if (isDown) {
      isDown = false;
      logger.info("Redis connection restored");
    }
  });

  return {
    connect: async () => {
      await client.connect();
      hasConnected = true;
      isDown = false;
    },

    sendCommand: (args) => client.sendCommand(args),

    healthCheck: async () => {
      await client.ping();
    },

    close: async () => {
      if (client.isReady) {
        // Waits for commands already sent.
        await client.close();
      } else if (client.isOpen) {
        // Reconnecting: there is nothing to wait for.
        client.destroy();
      }
    },
  };
};
