import type { CookieOptions, Request, Response } from "express";

const REFRESH_TOKEN_COOKIE = "refresh_token";

// Matches where the auth router is mounted, so the browser only sends the
// cookie to auth routes and never to the rest of the API.
const REFRESH_TOKEN_COOKIE_PATH = "/api/v1/auth";

const cookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: "strict",
  path: REFRESH_TOKEN_COOKIE_PATH,
});

export const setRefreshTokenCookie = (
  response: Response,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void => {
  response.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...cookieOptions(secure),
    expires: expiresAt,
  });
};

export const clearRefreshTokenCookie = (
  response: Response,
  secure: boolean,
): void => {
  response.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions(secure));
};

export const readRefreshTokenCookie = (
  request: Request,
): string | undefined => {
  const value: unknown = request.cookies?.[REFRESH_TOKEN_COOKIE];

  return typeof value === "string" && value.length > 0 ? value : undefined;
};
