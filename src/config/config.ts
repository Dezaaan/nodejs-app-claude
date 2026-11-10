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
    origin: env.CLIENT_ORIGIN,
  },
  logging: {
    level: env.LOG_LEVEL,
  },
});
