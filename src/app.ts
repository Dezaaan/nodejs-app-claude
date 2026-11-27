import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { AppContainer } from "./app/container.types.js";
import { createRateLimiter } from "./shared/http/createRateLimiter.js";
import { createErrorMiddleware } from "./shared/errors/errorMiddleware.js";
import { createRequestLoggingMiddleware } from "./shared/http/requestLoggingMiddleware.js";
import { createRoutes } from "./routes/createRoutes.js";
import { notFoundMiddleware } from "./shared/errors/notFoundMiddleware.js";
import { requestIdMiddleware } from "./shared/http/requestIdMiddleware.js";

export const createApp = (container: AppContainer) => {
  const app = express();

  // Rate limiting needs the real client IP when running behind a proxy.
  app.set("trust proxy", container.config.app.trustProxyHops);

  const apiRateLimiter = createRateLimiter({
    name: "api",
    limit: container.config.rateLimit.apiPerMinute,
    windowMs: 60_000,
    redis: container.infrastructure.redis,
    logger: container.infrastructure.logger,
  });

  app.use(createRequestLoggingMiddleware(container.infrastructure.logger));

  app.use(helmet());

  app.use(requestIdMiddleware);

  app.use(
    cors({
      origin: container.config.cors.origin,
      // Lets the frontend send and receive the refresh token cookie.
      credentials: true,
    }),
  );

  app.use(express.json());

  app.use(cookieParser());

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
    });
  });

  app.get("/ready", async (_request, response) => {
    const { database, redis } = container.infrastructure;

    // Redis is reported but doesn't decide readiness: without it the app
    // still works (only without rate limits), and taking every copy out of
    // the load balancer during a Redis outage would stop all traffic.
    const [databaseCheck, redisCheck] = await Promise.allSettled([
      database.healthCheck(),
      redis.healthCheck(),
    ]);
    const ready = databaseCheck.status === "fulfilled";

    response.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      database: ready ? "up" : "down",
      redis: redisCheck.status === "fulfilled" ? "up" : "down",
    });
  });

  app.use("/api/v1", apiRateLimiter, createRoutes(container));

  app.use(notFoundMiddleware);
  app.use(createErrorMiddleware(container.infrastructure.logger));

  return app;
};
