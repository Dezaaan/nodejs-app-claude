import type { RequestHandler } from "express";
import { ForbiddenError } from "../errors/ForbiddenError.js";

// Defense in depth against CSRF on cookie-authenticated routes: browsers send
// an Origin header on POST requests, so reject any that came from another
// site. Requests without one (curl, server-to-server) carry no cookie risk.
export const createTrustedOriginMiddleware = (
  trustedOrigin: string,
): RequestHandler => {
  return (request, _response, next) => {
    const origin = request.get("origin");

    if (origin !== undefined && origin !== trustedOrigin) {
      next(new ForbiddenError("Request origin is not allowed"));

      return;
    }

    next();
  };
};
