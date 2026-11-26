import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import type { Logger } from "../../infrastructure/createLogger.js";
import type { Redis } from "../../infrastructure/redis/redis.js";

// During a Redis outage every request fails to reach the store; one log line
// per this period is enough to show it.
const STORE_ERROR_LOG_INTERVAL_MS = 30_000;

type CreateRateLimiterOptions = {
  // Keeps each limiter's counters apart in Redis, for example "api".
  name: string;
  limit: number;
  windowMs: number;
  redis: Redis;
  logger: Logger;
};

// Counts requests per client IP in Redis, so every app copy shares the same
// counters: a client gets `limit` requests per window in total, not per copy.
//
// If Redis is down, requests are let through without a limit. Briefly losing
// rate limiting is better than failing every request.
export const createRateLimiter = ({
  name,
  limit,
  windowMs,
  redis,
  logger,
}: CreateRateLimiterOptions): RateLimitRequestHandler => {
  let lastErrorLoggedAt = 0;

  const logStoreError = (error: unknown) => {
    const now = Date.now();

    if (now - lastErrorLoggedAt >= STORE_ERROR_LOG_INTERVAL_MS) {
      lastErrorLoggedAt = now;
      logger.error("Rate limiter can't reach Redis; requests are not limited", {
        limiter: name,
        error,
      });
    }
  };

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: new RedisStore({
      prefix: `rl:${name}:`,
      sendCommand: (...args: string[]) =>
        redis.sendCommand(args) as Promise<RedisReply>,
    }),
    logger: {
      error: logStoreError,
      warn: (error, message) => {
        logger.warn(message ?? "Rate limiter warning", {
          limiter: name,
          error,
        });
      },
    },
  });
};
