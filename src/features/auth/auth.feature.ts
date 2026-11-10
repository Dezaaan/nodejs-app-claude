import type { RequestHandler } from "express";
import type { AppConfig } from "../../config/config.js";
import type { Logger } from "../../infrastructure/createLogger.js";
import type { Database } from "../../infrastructure/database/database.types.js";
import {
  createAuthController,
  type AuthController,
} from "./auth.controller.js";
import { createRequireAuth } from "./auth.middleware.js";
import { createPasswordHasher } from "./auth.passwords.js";
import {
  createPostgresRefreshTokensRepository,
  createPostgresUsersRepository,
} from "./auth.repository.postgres.js";
import { createAuthService, type AuthService } from "./auth.service.js";
import { createAccessTokens } from "./auth.tokens.js";

export type AuthFeature = {
  service: AuthService;
  controller: AuthController;
  requireAuth: RequestHandler;
};

type CreateAuthFeatureDependencies = {
  database: Database;
  logger: Logger;
  config: AppConfig["auth"];
};

export const createAuthFeature = ({
  database,
  logger,
  config,
}: CreateAuthFeatureDependencies): AuthFeature => {
  const service = createAuthService({
    usersRepository: createPostgresUsersRepository({ database }),
    refreshTokensRepository: createPostgresRefreshTokensRepository({
      database,
    }),
    passwordHasher: createPasswordHasher(),
    accessTokens: createAccessTokens({
      secret: config.jwtSecret,
      ttlSeconds: config.accessTokenTtlSeconds,
    }),
    refreshTokenTtlDays: config.refreshTokenTtlDays,
    logger,
  });

  const controller = createAuthController({
    authService: service,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    cookieSecure: config.cookieSecure,
  });

  return {
    service,
    controller,
    requireAuth: createRequireAuth(service),
  };
};
