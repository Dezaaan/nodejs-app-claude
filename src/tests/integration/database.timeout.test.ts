import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../infrastructure/database/database.js";
import { isDatabaseBusyError } from "../../infrastructure/database/isDatabaseBusyError.js";
import { createTestConfig } from "../helpers/createTestConfig.js";
import { createTestLogger } from "../helpers/createTestLogger.js";

const config = createTestConfig();

const database = createDatabase(
  { ...config.database, poolMax: 1, statementTimeoutMs: 100 },
  createTestLogger(),
);

describe("Database timeouts", () => {
  afterAll(async () => {
    await database.close();
  });

  it("cancels a query that runs past the statement timeout", async () => {
    const error: unknown = await database
      .query("SELECT pg_sleep(2)")
      .catch((caught: unknown) => caught);

    expect(isDatabaseBusyError(error)).toBe(true);
  });

  it("still answers fast queries afterwards", async () => {
    const result = await database.query<{ ok: number }>("SELECT 1 AS ok");

    expect(result.rows[0]?.ok).toBe(1);
  });

  it("doesn't treat other database errors as busy", async () => {
    const error: unknown = await database
      .query("SELECT * FROM table_that_does_not_exist")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(isDatabaseBusyError(error)).toBe(false);
  });
});
