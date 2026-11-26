import { Router } from "express";
import type { AppContainer } from "../app/container.types.js";
import { createAuthRoutes } from "../features/auth/auth.routes.js";
import { createNotesRoutes } from "../features/notes/notes.routes.js";
import { createRateLimiter } from "../shared/http/createRateLimiter.js";
import { createTrustedOriginMiddleware } from "../shared/http/trustedOriginMiddleware.js";

export const createRoutes = (container: AppContainer): Router => {
  const router = Router();
  const { auth, notes } = container.features;

  const authRateLimiter = createRateLimiter({
    name: "auth",
    limit: container.config.rateLimit.authPerMinute,
    windowMs: 60_000,
    redis: container.infrastructure.redis,
    logger: container.infrastructure.logger,
  });

  router.use(
    "/auth",
    authRateLimiter,
    // Auth routes use the refresh token cookie, so they need CSRF protection.
    createTrustedOriginMiddleware(container.config.cors.origin),
    createAuthRoutes({
      authController: auth.controller,
      requireAuth: auth.requireAuth,
    }),
  );

  router.use(
    "/notes",
    auth.requireAuth,
    createNotesRoutes({
      notesController: notes.controller,
    }),
  );

  return router;
};
