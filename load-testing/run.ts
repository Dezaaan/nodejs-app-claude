// Sends requests at a fixed rate to the load-test server and reports how it
// kept up:
//   npm run load:run -- --scenario mixed --rate 2000 --duration 30
// Start the server first with "npm run load:start". Results are also saved
// to load-testing/results/ so runs can be compared.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import autocannon from "autocannon";
import { SignJWT } from "jose";
import { encodeNotesCursor } from "../src/features/notes/notes.cursor.js";
import {
  createRandom,
  emailFor,
  LOAD_PASSWORD,
  loadEnv,
  uuidFor,
} from "./shared.js";

type Request = {
  method: "GET" | "POST";
  path: string;
  headers?: Record<string, string>;
  body?: string;
};

type Scenario = {
  description: string;
  next(): Request;
};

const { values } = parseArgs({
  options: {
    scenario: { type: "string", default: "mixed" },
    // Requests per second across all connections.
    rate: { type: "string", default: "2000" },
    duration: { type: "string", default: "30" },
    // Requests in flight at once. Must be high enough to reach the rate:
    // rate = connections / average response time.
    connections: { type: "string", default: "200" },
    // Must match the counts used for load:seed.
    users: { type: "string", default: "5000000" },
    url: { type: "string" },
  },
});

const env = loadEnv();
const baseUrl = values.url ?? `http://localhost:${env.PORT ?? "3100"}`;
const rate = Number(values.rate);
const duration = Number(values.duration);
const connections = Number(values.connections);
const userCount = Number(values.users);

// Users the test acts as. Real traffic comes from many different users, so
// caches and indexes see a realistic spread instead of one hot user.
const TOKEN_POOL_SIZE = 5_000;
// The lowest user indexes own the most notes (see noteOwnerIndex).
const HEAVY_USERS = 100;
const SEARCH_TERMS = ["meeting", "budget", "travel", "release", "berlin"];

const random = createRandom(Date.now());
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random.next() * items.length)]!;

const key = new TextEncoder().encode(env.JWT_SECRET);

// Signs access tokens the way the API does, so the test doesn't have to log
// in thousands of users first. Login is deliberately slow (argon2) and has
// its own scenario.
const signToken = (userIndex: number): Promise<string> =>
  new SignJWT({ role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(uuidFor("user", userIndex))
    .setIssuer("nodejs-app-claude")
    .setAudience("nodejs-app-claude-api")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(key);

// Every tenth seeded user is a read-only viewer; act only as editors so
// writes don't fail with 403.
const isEditor = (userIndex: number) => userIndex % 10 !== 9;

const randomEditor = (max: number): number => {
  for (;;) {
    const index = Math.floor(random.next() * max);

    if (isEditor(index)) {
      return index;
    }
  }
};

const createTokenPool = async (size: number, maxIndex: number) => {
  const tokens = await Promise.all(
    Array.from({ length: size }, () => signToken(randomEditor(maxIndex))),
  );

  return tokens.map((token) => ({ authorization: `Bearer ${token}` }));
};

const users = await createTokenPool(TOKEN_POOL_SIZE, userCount);
const heavyUsers = await createTokenPool(HEAVY_USERS, HEAVY_USERS);

// Common words, a word no note contains, and two-word phrases, which match
// many notes by trigram but few in full.
const HEAVY_SEARCH_TERMS = [
  ...SEARCH_TERMS,
  "xyzzy",
  "berlin tokyo",
  "budget review",
];

const SEEDED_PERIOD_MS = 2 * 365 * 86_400_000;
const SEED_NOW = Date.parse("2026-11-01T00:00:00.000Z");

// A cursor pointing somewhere in the seeded two years, as if the client had
// followed nextCursor that deep. Built with the API's own encoder; the
// largest id sorts first among notes created in the same millisecond.
const randomDeepCursor = (): string =>
  encodeNotesCursor({
    sortBy: "createdAt",
    sortOrder: "desc",
    value: new Date(SEED_NOW - random.next() * SEEDED_PERIOD_MS).toISOString(),
    id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
  });

const listNotes = (): Request => ({
  method: "GET",
  path: "/api/v1/notes",
  headers: pick(users),
});

const searchNotes = (): Request => ({
  method: "GET",
  path: `/api/v1/notes?search=${pick(SEARCH_TERMS)}`,
  headers: pick(users),
});

const createNote = (): Request => ({
  method: "POST",
  path: "/api/v1/notes",
  headers: { ...pick(users), "content-type": "application/json" },
  body: JSON.stringify({
    title: `Load test ${Date.now()}`,
    content: "Created by the load test",
  }),
});

const scenarios: Record<string, Scenario> = {
  list: {
    description: "First page of notes for random users",
    next: listNotes,
  },
  search: {
    description: "Search notes for random users",
    next: searchNotes,
  },
  write: {
    description: "Create notes for random users",
    next: createNote,
  },
  heavy: {
    description:
      "Users with tens of thousands of notes, browsing deep pages (page 1-500)",
    next: () => ({
      method: "GET",
      path: `/api/v1/notes?page=${random.int(1, 500)}`,
      headers: pick(heavyUsers),
    }),
  },
  "heavy-cursor": {
    description:
      "The same users and depths as heavy, using cursors instead of page numbers",
    next: () => ({
      method: "GET",
      path: `/api/v1/notes?cursor=${randomDeepCursor()}`,
      headers: pick(heavyUsers),
    }),
  },
  "heavy-search": {
    description: "Users with tens of thousands of notes, searching",
    next: () => ({
      method: "GET",
      path: `/api/v1/notes?search=${encodeURIComponent(pick(HEAVY_SEARCH_TERMS))}`,
      headers: pick(heavyUsers),
    }),
  },
  mixed: {
    description: "80% list, 10% search, 10% create",
    next: () => {
      const roll = random.next();

      if (roll < 0.8) return listNotes();
      if (roll < 0.9) return searchNotes();
      return createNote();
    },
  },
  login: {
    description:
      "Log in as random users (argon2 is slow on purpose: use a low rate)",
    next: () => ({
      method: "POST",
      path: "/api/v1/auth/login",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: emailFor(randomEditor(userCount)),
        password: LOAD_PASSWORD,
      }),
    }),
  },
};

const scenario = scenarios[values.scenario];

if (!scenario) {
  console.error(
    `Unknown scenario "${values.scenario}". Choose one of: ${Object.keys(scenarios).join(", ")}`,
  );
  process.exit(1);
}

console.log(
  `${values.scenario}: ${scenario.description}\n` +
    `${rate} requests/s for ${duration}s, ${connections} connections, against ${baseUrl}\n`,
);

// autocannon supports warmup, but its type definitions don't list it yet.
type Options = autocannon.Options & {
  warmup: { connections: number; duration: number };
};

const options: Options = {
  url: baseUrl,
  connections,
  duration,
  overallRate: rate,
  // Gives the server a few seconds to warm up before measuring.
  warmup: { connections, duration: 5 },
  requests: [
    {
      setupRequest: (request) => ({ ...request, ...scenario.next() }),
    },
  ],
};

const result = await autocannon(options);

const statusCounts = Object.entries(result.statusCodeStats ?? {})
  .map(([status, stats]) => `${status}: ${stats.count}`)
  .join(", ");

const summary = {
  scenario: values.scenario,
  targetRate: rate,
  achievedRate: Math.round(result.requests.average),
  latencyMs: {
    p50: result.latency.p50,
    p90: result.latency.p90,
    p99: result.latency.p99,
    max: result.latency.max,
  },
  totalRequests: result.requests.total,
  non2xx: result.non2xx,
  errors: result.errors,
  timeouts: result.timeouts,
};

console.log(`Achieved:  ${summary.achievedRate} requests/s (target ${rate})`);
console.log(
  `Latency:   p50 ${summary.latencyMs.p50} ms, p90 ${summary.latencyMs.p90} ms, p99 ${summary.latencyMs.p99} ms, max ${summary.latencyMs.max} ms`,
);
console.log(`Responses: ${statusCounts || "none"}`);
console.log(
  `Failures:  ${summary.non2xx} non-2xx, ${summary.errors} errors, ${summary.timeouts} timeouts`,
);

mkdirSync("load-testing/results", { recursive: true });
const file = `load-testing/results/${new Date().toISOString().replace(/[:.]/g, "-")}-${values.scenario}.json`;
writeFileSync(file, JSON.stringify({ ...summary, raw: result }, null, 2));
console.log(`\nSaved to ${file}`);
