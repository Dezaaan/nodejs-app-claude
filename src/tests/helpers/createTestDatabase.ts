import { createDatabase } from "../../infrastructure/database/database.js";
import { createTestConfig } from "./createTestConfig.js";
import { createTestLogger } from "./createTestLogger.js";

export const createTestDatabase = () => {
  const config = createTestConfig();

  return createDatabase(config.database, createTestLogger());
};
