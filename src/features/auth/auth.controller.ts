import type { RequestHandler, Response } from "express";
import { getAuth } from "../../shared/http/authContext.js";
import { validatedHandler } from "../../shared/http/validatedHandler.js";
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
} from "./auth.cookies.js";
import { loginSchema, registerSchema } from "./auth.schema.js";
import type { AuthService } from "./auth.service.js";
import type { AuthSession, User } from "./auth.types.js";

export type UserResponseDto = {
  id: string;
  email: string;
  createdAt: string;
};

const mapUserToResponseDto = (user: User): UserResponseDto => ({
  id: user.id,
  email: user.email,
  createdAt: user.createdAt.toISOString(),
});

export type AuthController = {
  register: RequestHandler;
  login: RequestHandler;
  refresh: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
};

type CreateAuthControllerDependencies = {
  authService: AuthService;
  accessTokenTtlSeconds: number;
  cookieSecure: boolean;
};

export const createAuthController = ({
  authService,
  accessTokenTtlSeconds,
  cookieSecure,
}: CreateAuthControllerDependencies): AuthController => {
  // The refresh token goes only into the httpOnly cookie, never the body.
  const sendSession = (
    response: Response,
    statusCode: number,
    session: AuthSession,
  ): void => {
    setRefreshTokenCookie(
      response,
      session.refreshToken,
      session.refreshTokenExpiresAt,
      cookieSecure,
    );

    response.status(statusCode).json({
      user: mapUserToResponseDto(session.user),
      accessToken: session.accessToken,
      accessTokenExpiresIn: accessTokenTtlSeconds,
    });
  };

  const register = validatedHandler(
    { body: registerSchema },
    async ({ body }, response) => {
      sendSession(response, 201, await authService.register(body));
    },
  );

  const login = validatedHandler(
    { body: loginSchema },
    async ({ body }, response) => {
      sendSession(response, 200, await authService.login(body));
    },
  );

  const refresh = validatedHandler({}, async (_input, response, request) => {
    try {
      const session = await authService.refresh(
        readRefreshTokenCookie(request),
      );

      sendSession(response, 200, session);
    } catch (error) {
      // Drop the unusable cookie so the browser stops sending it.
      clearRefreshTokenCookie(response, cookieSecure);

      throw error;
    }
  });

  const logout = validatedHandler({}, async (_input, response, request) => {
    await authService.logout(readRefreshTokenCookie(request));

    clearRefreshTokenCookie(response, cookieSecure);

    response.status(204).send();
  });

  const me = validatedHandler({}, async (_input, response) => {
    const user = await authService.getCurrentUser(getAuth(response).userId);

    response.status(200).json({ user: mapUserToResponseDto(user) });
  });

  return {
    login,
    logout,
    me,
    refresh,
    register,
  };
};
