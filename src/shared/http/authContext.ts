import type { Response } from "express";
import { UnauthorizedError } from "../errors/UnauthorizedError.js";

export type AuthContext = {
  userId: string;
};

export const setAuth = (response: Response, auth: AuthContext): void => {
  response.locals.auth = auth;
};

// Reads the user set by the requireAuth middleware. Throws if the route was
// mounted without it, so a missing middleware fails closed.
export const getAuth = (response: Response): AuthContext => {
  const auth: unknown = response.locals.auth;

  if (
    typeof auth === "object" &&
    auth !== null &&
    "userId" in auth &&
    typeof auth.userId === "string"
  ) {
    return { userId: auth.userId };
  }

  throw new UnauthorizedError();
};
