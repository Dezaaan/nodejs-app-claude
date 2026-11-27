import type { AppConfig } from "../config/config.js";
import { createLogger } from "./createLogger.js";
import { createDatabase } from "./database/database.js";
import { createRedis } from "./redis/redis.js";

export type Infrastructure = ReturnType<typeof createInfrastructure>;

export const createInfrastructure = (config: AppConfig) => {
  const logger = createLogger(config.logging);
  const database = createDatabase(config.database, logger);
  const redis = createRedis(config.redis, logger);

  return {
    database,
    redis,
    logger,
  };
};
