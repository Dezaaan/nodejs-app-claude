import { Router, type RequestHandler } from "express";
import type { AuthController } from "./auth.controller.js";

type CreateAuthRoutesDependencies = {
  authController: AuthController;
  requireAuth: RequestHandler;
};

export const createAuthRoutes = ({
  authController,
  requireAuth,
}: CreateAuthRoutesDependencies): Router => {
  const router = Router();

  router.post("/register", authController.register);
  router.post("/login", authController.login);
  router.post("/refresh", authController.refresh);
  router.post("/logout", authController.logout);
  router.get("/me", requireAuth, authController.me);

  return router;
};
