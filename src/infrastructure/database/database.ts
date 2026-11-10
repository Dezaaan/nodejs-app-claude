import { Pool } from "pg";

import type { AppConfig } from "../../config/config.js";
import type { Logger } from "../createLogger.js";
import type { Database } from "./database.types.js";

export const createDatabase = (
  config: AppConfig["database"],
  logger: Logger,
): Database => {
  const pool = new Pool({
    connectionString: config.url,
    max: 10,
    connectionTimeoutMillis: 5_000,
  });

  // Without a listener, an idle client error crashes the process.
  pool.on("error", (error) => {
    logger.error("Idle database client error", {
      error,
    });
  });

  return {
    query: (text, params) => pool.query(text, params),

    connect: () => pool.connect(),

    healthCheck: async () => {
      await pool.query("SELECT 1");
    },

    close: () => pool.end(),
  };
};
