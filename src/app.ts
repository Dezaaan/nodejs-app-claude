import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { AppContainer } from "./app/container.types.js";
import { createErrorMiddleware } from "./shared/errors/errorMiddleware.js";
import { createRequestLoggingMiddleware } from "./shared/http/requestLoggingMiddleware.js";
import { createRoutes } from "./routes/createRoutes.js";
import { notFoundMiddleware } from "./shared/errors/notFoundMiddleware.js";
import { rateLimit } from "express-rate-limit";
import { requestIdMiddleware } from "./shared/http/requestIdMiddleware.js";

const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

export const createApp = (container: AppContainer) => {
  const app = express();

  app.use(createRequestLoggingMiddleware(container.infrastructure.logger));

  app.use(helmet());

  app.use(requestIdMiddleware);

  app.use(
    cors({
      origin: container.config.cors.origin,
    }),
  );

  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
    });
  });

  app.get("/ready", async (_request, response) => {
    try {
      await container.infrastructure.database.healthCheck();

      response.status(200).json({
        status: "ready",
      });
    } catch {
      response.status(503).json({
        status: "not_ready",
      });
    }
  });

  app.use("/api/v1", apiRateLimiter, createRoutes(container));

  app.use(notFoundMiddleware);
  app.use(createErrorMiddleware(container.infrastructure.logger));

  return app;
};
