import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import {
  getRefreshCookie,
  getSetCookieHeader,
  registerTestUser,
} from "../helpers/authHelpers.js";
import { createTestContainer } from "../helpers/createTestContainer.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

const container = createTestContainer();
const app = createApp(container);

describe("Auth API", () => {
  beforeEach(async () => {
    await resetDatabase(container.infrastructure.database);
  });

  afterAll(async () => {
    await container.infrastructure.database.close();
  });

  describe("register", () => {
    it("creates a user and starts a session", async () => {
      const response = await request(app).post("/api/v1/auth/register").send({
        email: "  Ana@Example.com ",
        password: "long enough password",
      });

      expect(response.status).toBe(201);

      expect(response.body).toEqual({
        user: {
          id: expect.any(String),
          email: "ana@example.com",
          createdAt: expect.any(String),
        },
        accessToken: expect.any(String),
        accessTokenExpiresIn: 900,
      });
    });

    it("sets the refresh token as a protected cookie, not in the body", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "ana@example.com", password: "long enough password" });

      const cookie = getSetCookieHeader(response);

      expect(cookie).toMatch(/^refresh_token=[\w-]{43};/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/api/v1/auth");
      expect(JSON.stringify(response.body)).not.toContain("refresh");
    });

    it("rejects an email that is already registered, ignoring case", async () => {
      await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "ana@example.com", password: "long enough password" });

      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "ANA@example.com", password: "another password" });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("rejects a short password", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "ana@example.com", password: "short" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("login", () => {
    it("logs in with the right password", async () => {
      const user = await registerTestUser(app);

      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: user.password });

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(user.id);
      expect(getRefreshCookie(response)).toMatch(/^refresh_token=/);
    });

    it("gives the same error for a wrong password and an unknown email", async () => {
      const user = await registerTestUser(app);

      const wrongPassword = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: "wrong password" });

      const unknownEmail = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "nobody@example.com", password: "wrong password" });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });
  });

  describe("me", () => {
    it("returns the current user", async () => {
      const user = await registerTestUser(app);

      const response = await request(app)
        .get("/api/v1/auth/me")
        .auth(user.accessToken, { type: "bearer" });

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        id: user.id,
        email: user.email,
      });
    });

    it("rejects a missing access token", async () => {
      const response = await request(app).get("/api/v1/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects a tampered access token", async () => {
      const user = await registerTestUser(app);
      const [header, payload] = user.accessToken.split(".");

      const response = await request(app)
        .get("/api/v1/auth/me")
        .auth(`${header}.${payload}.invalid-signature`, { type: "bearer" });

      expect(response.status).toBe(401);
    });
  });

  describe("refresh", () => {
    it("issues a new access token and rotates the refresh token", async () => {
      const user = await registerTestUser(app);

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .set("cookie", user.refreshCookie);

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(user.id);

      const me = await request(app)
        .get("/api/v1/auth/me")
        .auth(response.body.accessToken, { type: "bearer" });

      expect(me.status).toBe(200);
      expect(getRefreshCookie(response)).not.toBe(user.refreshCookie);
    });

    it("revokes the whole session when an old refresh token is reused", async () => {
      const user = await registerTestUser(app);

      const rotated = await request(app)
        .post("/api/v1/auth/refresh")
        .set("cookie", user.refreshCookie);

      const reuse = await request(app)
        .post("/api/v1/auth/refresh")
        .set("cookie", user.refreshCookie);

      expect(reuse.status).toBe(401);

      // The token issued by the legitimate rotation is now revoked too.
      const afterReuse = await request(app)
        .post("/api/v1/auth/refresh")
        .set("cookie", getRefreshCookie(rotated));

      expect(afterReuse.status).toBe(401);
    });

    it("rejects a request without a refresh token", async () => {
      const response = await request(app).post("/api/v1/auth/refresh");

      expect(response.status).toBe(401);
    });

    it("clears the cookie when the refresh token is invalid", async () => {
      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .set("cookie", "refresh_token=not-a-real-token");

      expect(response.status).toBe(401);
      expect(getSetCookieHeader(response)).toContain(
        "Expires=Thu, 01 Jan 1970",
      );
    });
  });

  describe("logout", () => {
    it("ends the session and clears the cookie", async () => {
      const user = await registerTestUser(app);

      const response = await request(app)
        .post("/api/v1/auth/logout")
        .set("cookie", user.refreshCookie);

      expect(response.status).toBe(204);
      expect(getSetCookieHeader(response)).toContain(
        "Expires=Thu, 01 Jan 1970",
      );

      const refresh = await request(app)
        .post("/api/v1/auth/refresh")
        .set("cookie", user.refreshCookie);

      expect(refresh.status).toBe(401);
    });

    it("only ends the current session", async () => {
      const user = await registerTestUser(app);

      const otherSession = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: user.password });

      await request(app)
        .post("/api/v1/auth/logout")
        .set("cookie", user.refreshCookie);

      const refresh = await request(app)
        .post("/api/v1/auth/refresh")
        .set("cookie", getRefreshCookie(otherSession));

      expect(refresh.status).toBe(200);
    });
  });

  describe("origin check", () => {
    it("rejects auth requests from another site", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .set("origin", "https://evil.example")
        .send({ email: "ana@example.com", password: "long enough password" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("allows auth requests from the frontend origin", async () => {
      const user = await registerTestUser(app);

      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .set("origin", container.config.cors.origin)
        .set("cookie", user.refreshCookie);

      expect(response.status).toBe(200);
    });
  });
});
