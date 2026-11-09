import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Logger } from "../../infrastructure/createLogger.js";
import { AppError } from "./AppError.js";

// Errors raised by express.json() (malformed JSON, body too large, ...)
const getBodyParserErrorStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const { status, expose } = error as { status?: unknown; expose?: unknown };

  return typeof status === "number" && expose === true ? status : undefined;
};

export const createErrorMiddleware = (logger: Logger): ErrorRequestHandler => {
  // Express only recognizes error handlers that declare all 4 parameters.
  return (error, request, response, next) => {
    if (response.headersSent) {
      next(error);

      return;
    }

    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });

      return;
    }

    if (error instanceof ZodError) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          details: error.flatten(),
          message: "Invalid request data",
        },
      });

      return;
    }

    const bodyParserErrorStatus = getBodyParserErrorStatus(error);

    if (bodyParserErrorStatus !== undefined) {
      const isTooLarge = bodyParserErrorStatus === 413;

      response.status(bodyParserErrorStatus).json({
        error: {
          code: isTooLarge ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
          message: isTooLarge
            ? "Request body is too large"
            : "Request could not be processed",
        },
      });

      return;
    }

    logger.error("Unhandled application error", {
      error,
      method: request.method,
      path: request.originalUrl,
      requestId: response.locals.requestId,
    });

    response.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    });
  };
};
