import type { Env } from "./env.js";

export type AppConfig = {
  app: {
    environment: Env["NODE_ENV"];
    port: number;
    trustProxyHops: number;
  };
  database: {
    url: string;
  };
  cors: {
    origin: string;
  };
  logging: {
    level: Env["LOG_LEVEL"];
  };
  auth: {
    jwtSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    cookieSecure: boolean;
  };
  rateLimit: {
    apiPerMinute: number;
    authPerMinute: number;
  };
};

export const createConfig = (env: Env): AppConfig => ({
  app: {
    environment: env.NODE_ENV,
    port: env.PORT,
    trustProxyHops: env.TRUST_PROXY_HOPS,
  },
  database: {
    url: env.DATABASE_URL,
  },
  cors: {
    // Normalized (no trailing slash) so it matches the browser's Origin header.
    origin: new URL(env.CLIENT_ORIGIN).origin,
  },
  logging: {
    level: env.LOG_LEVEL,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    cookieSecure: env.COOKIE_SECURE,
  },
  rateLimit: {
    apiPerMinute: 100,
    // Stricter on auth routes to slow down password guessing.
    authPerMinute: 20,
  },
});
