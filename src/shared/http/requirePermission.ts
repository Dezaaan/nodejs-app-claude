import type { RequestHandler } from "express";
import { hasPermission, type Permission } from "../auth/permissions.js";
import { ForbiddenError } from "../errors/ForbiddenError.js";
import { getAuth } from "./authContext.js";

// Must run after requireAuth. Without it, getAuth throws and the request
// gets a 401, so a misconfigured route fails closed.
export const requirePermission =
  (permission: Permission): RequestHandler =>
  (_request, response, next) => {
    if (!hasPermission(getAuth(response).role, permission)) {
      throw new ForbiddenError("You do not have permission to do this");
    }

    next();
  };
