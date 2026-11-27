// Fills the load-testing database with generated users and notes:
//   npm run load:seed -- --users 5000000 --notes 10000000
// Deletes existing data first. The same counts always produce the same data.
//
// Rows are generated lazily and streamed into PostgreSQL's COPY. pipeline()
// only asks the generator for the next batch when the database connection
// has room (backpressure), so memory stays flat whether the run inserts a
// thousand rows or twenty million.
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import argon2 from "argon2";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import {
  assertLoadDatabase,
  createRandom,
  emailFor,
  formatDuration,
  LOAD_PASSWORD,
  loadEnv,
  noteOwnerIndex,
  uuidFor,
} from "./shared.js";

const { values } = parseArgs({
  options: {
    users: { type: "string", default: "5000000" },
    notes: { type: "string", default: "10000000" },
  },
});

const userCount = Number(values.users);
const noteCount = Number(values.notes);

if (!Number.isSafeInteger(userCount) || userCount < 1) {
  throw new Error("--users must be a positive integer");
}

if (!Number.isSafeInteger(noteCount) || noteCount < 0) {
  throw new Error("--notes must be zero or a positive integer");
}

// Rows per chunk handed to the stream. Bigger chunks mean fewer stream
// calls; this size keeps each chunk around 100-300 KB.
const ROWS_PER_CHUNK = 1_000;
const PROGRESS_EVERY = 1_000_000;
const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-11-01T00:00:00.000Z");
// Index builds run a few at a time, each with this much memory.
const PARALLEL_INDEX_BUILDS = 3;
const INDEX_BUILD_MEMORY = "512MB";

const WORDS = (
  "meeting project budget review plan idea draft list travel recipe book " +
  "garden invoice report design sprint release bug feature customer team " +
  "weekly monthly quarter goal summary notes call email follow up deadline " +
  "launch research interview market product roadmap backlog retro demo " +
  "training workshop health workout grocery shopping family birthday gift " +
  "holiday flight hotel booking car repair insurance tax bank payment " +
  "server database cache queue stream batch deploy monitor alert incident " +
  "security password backup migration index query performance latency " +
  "london paris berlin belgrade tokyo spring summer autumn winter morning " +
  "evening important urgent later maybe todo done blocked waiting"
).split(" ");

const databaseUrl = loadEnv().DATABASE_URL!;
const databaseName = assertLoadDatabase(databaseUrl);

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: PARALLEL_INDEX_BUILDS,
});

const log = (message: string) => {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
};

const words = (random: ReturnType<typeof createRandom>, count: number) => {
  const picked: string[] = [];

  for (let i = 0; i < count; i++) {
    picked.push(WORDS[random.int(0, WORDS.length - 1)]!);
  }

  return picked.join(" ");
};

// Yields COPY text-format chunks. Generated values never contain tabs,
// newlines or backslashes, so they need no escaping.
function* chunks(
  count: number,
  label: string,
  row: (index: number) => string,
): Generator<string> {
  const startedAt = Date.now();
  let lines: string[] = [];

  for (let index = 0; index < count; index++) {
    lines.push(row(index));

    if (lines.length === ROWS_PER_CHUNK) {
      yield lines.join("\n") + "\n";
      lines = [];
    }

    if ((index + 1) % PROGRESS_EVERY === 0) {
      const perSecond = Math.round(
        ((index + 1) / (Date.now() - startedAt)) * 1000,
      );

      log(
        `${label}: ${(index + 1).toLocaleString("en")} / ${count.toLocaleString("en")} (${perSecond.toLocaleString("en")} rows/s)`,
      );
    }
  }

  if (lines.length > 0) {
    yield lines.join("\n") + "\n";
  }
}

const copyRows = async (
  table: string,
  columns: string[],
  rows: Generator<string>,
) => {
  const client = await pool.connect();

  try {
    const copy = client.query(
      copyFrom(`COPY ${table} (${columns.join(", ")}) FROM STDIN`),
    );

    await pipeline(Readable.from(rows), copy);
  } finally {
    client.release();
  }
};

// Drops the indexes that aren't primary keys or unique constraints: bulk
// loading into an indexed table is several times slower than building the
// index once. Their definitions are saved in the database first, in the same
// transaction, so a run that is interrupted still rebuilds them next time.
const takeSecondaryIndexes = async (): Promise<string[]> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TABLE IF NOT EXISTS load_test_dropped_indexes (definition text PRIMARY KEY)",
    );

    const result = await client.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('users', 'notes', 'refresh_tokens')
        AND indexname NOT IN (SELECT conname FROM pg_constraint)
    `);

    for (const { indexname, indexdef } of result.rows) {
      await client.query(
        "INSERT INTO load_test_dropped_indexes VALUES ($1) ON CONFLICT DO NOTHING",
        [indexdef],
      );
      await client.query(`DROP INDEX "${indexname}"`);
    }

    const saved = await client.query<{ definition: string }>(
      "SELECT definition FROM load_test_dropped_indexes",
    );

    await client.query("COMMIT");

    return saved.rows.map((row) => row.definition);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const rebuildIndexes = async (definitions: string[]) => {
  const queue = [...definitions];

  const worker = async () => {
    const client = await pool.connect();

    try {
      await client.query(`SET maintenance_work_mem = '${INDEX_BUILD_MEMORY}'`);
      await client.query("SET max_parallel_maintenance_workers = 2");

      for (let next = queue.shift(); next; next = queue.shift()) {
        const startedAt = Date.now();
        await client.query(next);

        log(
          `Built ${/INDEX (\S+)/.exec(next)?.[1] ?? next} in ${formatDuration(Date.now() - startedAt)}`,
        );
      }
    } finally {
      client.release();
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(PARALLEL_INDEX_BUILDS, definitions.length) },
      worker,
    ),
  );
};

const startedAt = Date.now();

try {
  log(
    `Seeding ${databaseName} with ${userCount.toLocaleString("en")} users and ${noteCount.toLocaleString("en")} notes`,
  );

  await pool.query("TRUNCATE TABLE notes, refresh_tokens, users");

  const indexes = await takeSecondaryIndexes();
  log(`Dropped ${indexes.length} indexes; they are rebuilt after loading`);

  // One real argon2 hash shared by every user: hashing millions of passwords
  // would take days, and login cost doesn't depend on whose hash it is.
  const passwordHash = await argon2.hash(LOAD_PASSWORD, {
    type: argon2.argon2id,
  });

  const userRandom = createRandom(1);

  await copyRows(
    "users",
    ["id", "email", "password_hash", "role", "created_at", "updated_at"],
    chunks(userCount, "users", (index) => {
      const createdAt = new Date(
        NOW - userRandom.next() * 3 * 365 * DAY_MS,
      ).toISOString();

      // About 1 in 10 users is read-only.
      const role = index % 10 === 9 ? "viewer" : "user";

      return `${uuidFor("user", index)}\t${emailFor(index)}\t${passwordHash}\t${role}\t${createdAt}\t${createdAt}`;
    }),
  );

  const noteRandom = createRandom(2);

  await copyRows(
    "notes",
    ["id", "user_id", "title", "content", "created_at", "updated_at"],
    chunks(noteCount, "notes", (index) => {
      const owner = noteOwnerIndex(noteRandom.next(), userCount);
      const created = NOW - noteRandom.next() * 2 * 365 * DAY_MS;
      // A third of notes were edited some time after being written.
      const updated =
        noteRandom.next() < 0.33
          ? created + noteRandom.next() * (NOW - created)
          : created;

      const title = words(noteRandom, noteRandom.int(2, 6));
      const content = words(noteRandom, noteRandom.int(10, 50));

      return `${uuidFor("note", index)}\t${uuidFor("user", owner)}\t${title}\t${content}\t${new Date(created).toISOString()}\t${new Date(updated).toISOString()}`;
    }),
  );

  log("Rebuilding indexes");
  await rebuildIndexes(indexes);
  await pool.query("DROP TABLE load_test_dropped_indexes");

  // Fresh statistics, so the query planner knows the tables' real sizes.
  log("Analyzing tables");
  await pool.query("ANALYZE users, notes");

  const size = await pool.query<{ size: string }>(
    "SELECT pg_size_pretty(pg_database_size(current_database())) AS size",
  );

  log(
    `Done in ${formatDuration(Date.now() - startedAt)}. Database size: ${size.rows[0]!.size}`,
  );
} finally {
  await pool.end();
}
