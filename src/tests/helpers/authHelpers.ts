import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshCookie: string;
};

// Returns the "refresh_token=..." pair from a response, ready to send back.
export const getRefreshCookie = (response: request.Response): string => {
  const header = response.headers["set-cookie"] as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith("refresh_token="));

  if (!cookie) {
    throw new Error("Response has no refresh_token cookie");
  }

  return cookie.split(";")[0]!;
};

export const getSetCookieHeader = (response: request.Response): string => {
  const header = response.headers["set-cookie"] as string[] | undefined;

  return header?.find((value) => value.startsWith("refresh_token=")) ?? "";
};

export const registerTestUser = async (app: Express): Promise<TestUser> => {
  const email = `user-${randomUUID()}@example.com`;
  const password = "correct horse battery staple";

  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password });

  if (response.status !== 201) {
    throw new Error(`Registration failed with status ${response.status}`);
  }

  return {
    id: response.body.user.id,
    email,
    password,
    accessToken: response.body.accessToken,
    refreshCookie: getRefreshCookie(response),
  };
};
