import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { runWithRequestContext } from "../../infrastructure/requestContext.js";

export const requestIdMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const requestId = randomUUID();

  response.locals.requestId = requestId;

  response.setHeader("x-request-id", requestId);

  runWithRequestContext({ requestId }, () => {
    next();
  });
};
