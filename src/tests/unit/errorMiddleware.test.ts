import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createErrorMiddleware } from "../../shared/errors/errorMiddleware.js";
import { createTestLogger } from "../helpers/createTestLogger.js";

const appThrowing = (error: unknown) => {
  const app = express();

  app.get("/", () => {
    throw error;
  });
  app.use(createErrorMiddleware(createTestLogger()));

  return app;
};

describe("Error middleware", () => {
  it.each([
    [
      "a query cancelled by the statement timeout",
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      }),
    ],
    [
      "no free database connection",
      new Error("timeout exceeded when trying to connect"),
    ],
  ])("answers 503 with Retry-After for %s", async (_label, error) => {
    const response = await request(appThrowing(error)).get("/");

    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("1");
    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("answers 500 for other unexpected errors", async () => {
    const response = await request(appThrowing(new Error("boom"))).get("/");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
