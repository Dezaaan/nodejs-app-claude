import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export const LOAD_ENV_FILE = ".env.load";

// Every seeded user has this password, so the login scenario can use any one.
export const LOAD_PASSWORD = "load-test-password";

export const emailFor = (userIndex: number): string =>
  `user${userIndex}@load.test`;

// The same index always gives the same UUID, so the load test can address
// seeded users without reading millions of IDs from the database. The IDs
// still look random, like real UUIDv4s, so indexes behave as they would.
export const uuidFor = (kind: "user" | "note", index: number): string => {
  const hex = createHash("md5").update(`${kind}:${index}`).digest("hex");
  const variant = (8 | (parseInt(hex[16]!, 16) & 3)).toString(16);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
};

// Small, fast, seeded PRNG (mulberry32): the same seed gives the same data.
export const createRandom = (seed: number) => {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));

  return { next, int };
};

// Notes per user are skewed like real usage: most users have a few notes or
// none, and the lowest indexes have tens of thousands (user 0 gets about
// 0.5% of all notes). Cubing a uniform number gives that power-law shape.
export const noteOwnerIndex = (random: number, userCount: number): number =>
  Math.min(userCount - 1, Math.floor(userCount * random ** 3));

export const loadEnv = (): Record<string, string | undefined> => {
  let text: string;

  try {
    text = readFileSync(LOAD_ENV_FILE, "utf8");
  } catch {
    throw new Error(
      `${LOAD_ENV_FILE} is missing. Run "npm run load:setup" first.`,
    );
  }

  return parseEnv(text);
};

// The seed command deletes everything, so it only runs against a database
// whose name says it is for load testing.
export const assertLoadDatabase = (databaseUrl: string): string => {
  const name = new URL(databaseUrl).pathname.slice(1);

  if (!name.endsWith("_load")) {
    throw new Error(
      `Refusing to use database "${name}": its name must end with "_load"`,
    );
  }

  return name;
};

export const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);

  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
