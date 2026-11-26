import type { AppConfig } from "../../config/config.js";
import { createConfig } from "../../config/config.js";
import { createEnv } from "../../config/env.js";

export const createTestConfig = (): AppConfig => {
  const env = createEnv();
  const config = createConfig(env);

  if (config.app.environment !== "test") {
    throw new Error("Tests must run with NODE_ENV=test");
  }

  // Tests delete data, and NODE_ENV alone is not enough: Vitest sets it to
  // "test" by itself, even when DATABASE_URL still comes from .env.
  const databaseName = new URL(config.database.url).pathname.slice(1);

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against database "${databaseName}": its name must end with "_test"`,
    );
  }

  // Tests flush their Redis database. Database 0 is the default one that
  // development uses, so tests need an explicit, different number.
  const redisDatabase = new URL(config.redis.url).pathname.slice(1);

  if (redisDatabase === "" || redisDatabase === "0") {
    throw new Error(
      `Refusing to run tests against Redis database "${redisDatabase || "0"}": REDIS_URL must end with another database number, such as /1`,
    );
  }

  return {
    ...config,
    // Tests send many requests from one IP within a minute.
    rateLimit: {
      apiPerMinute: 10_000,
      authPerMinute: 10_000,
    },
  };
};
