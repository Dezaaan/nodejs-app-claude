import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { AppContainer } from "../app/container.types.js";
import { createAuthRoutes } from "../features/auth/auth.routes.js";
import { createNotesRoutes } from "../features/notes/notes.routes.js";
import { createTrustedOriginMiddleware } from "../shared/http/trustedOriginMiddleware.js";

export const createRoutes = (container: AppContainer): Router => {
  const router = Router();
  const { auth, notes } = container.features;

  const authRateLimiter = rateLimit({
    windowMs: 60_000,
    limit: container.config.rateLimit.authPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
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
