import type { RequestHandler } from "express";
import type { Logger } from "../../infrastructure/createLogger.js";

export const createRequestLoggingMiddleware = (
  logger: Logger,
): RequestHandler => {
  return (request, response, next) => {
    const startedAt = performance.now();

    response.on("finish", () => {
      const durationMs = performance.now() - startedAt;

      logger.info("HTTP request completed", {
        requestId: response.locals.requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs),
      });
    });

    next();
  };
};
