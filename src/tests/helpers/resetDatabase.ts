import type { Database } from "../../infrastructure/database/database.types.js";

export const resetDatabase = async (database: Database): Promise<void> => {
  await database.query("TRUNCATE TABLE notes, refresh_tokens, users CASCADE");
};
