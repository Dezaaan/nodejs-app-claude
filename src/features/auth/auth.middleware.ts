import type { RequestHandler } from "express";
import { UnauthorizedError } from "../../shared/errors/UnauthorizedError.js";
import { setAuth } from "../../shared/http/authContext.js";
import type { AuthService } from "./auth.service.js";

const BEARER_TOKEN = /^Bearer\s+(\S+)$/i;

// Requires a valid access token in the Authorization header.
export const createRequireAuth = (authService: AuthService): RequestHandler => {
  return async (request, response, next) => {
    const token = BEARER_TOKEN.exec(request.get("authorization") ?? "")?.[1];

    if (!token) {
      throw new UnauthorizedError();
    }

    setAuth(response, await authService.authenticate(token));

    next();
  };
};
