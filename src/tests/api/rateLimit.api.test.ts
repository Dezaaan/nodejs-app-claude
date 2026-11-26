import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "../../app/container.js";
import { createApp } from "../../app.js";
import type { AppConfig } from "../../config/config.js";
import { createTestConfig } from "../helpers/createTestConfig.js";

const LIMIT = 3;

const baseConfig = createTestConfig();

const config: AppConfig = {
  ...baseConfig,
  rateLimit: { apiPerMinute: LIMIT, authPerMinute: LIMIT },
};

// Two copies of the app, as if running behind a load balancer. They share
// nothing but Redis and PostgreSQL.
const first = createContainer(config);
const second = createContainer(config);
const firstApp = createApp(first);
const secondApp = createApp(second);

// A copy whose Redis can't be reached: nothing listens on port 1.
const withoutRedis = createContainer({
  ...config,
  redis: { url: "redis://localhost:1/1" },
});
const withoutRedisApp = createApp(withoutRedis);

describe("Rate limiting", () => {
  beforeAll(async () => {
    await Promise.all([
      first.infrastructure.redis.connect(),
      second.infrastructure.redis.connect(),
    ]);
  });

  beforeEach(async () => {
    // Starts every test with no counters.
    await first.infrastructure.redis.sendCommand(["FLUSHDB"]);
  });

  afterAll(async () => {
    await Promise.all(
      [first, second, withoutRedis].flatMap((container) => [
        container.infrastructure.database.close(),
        container.infrastructure.redis.close(),
      ]),
    );
  });

  it("shares one limit across app copies", async () => {
    // Unauthenticated requests still count; they get 401 until the limit.
    const statuses = [];

    for (const app of [firstApp, secondApp, firstApp, secondApp]) {
      const response = await request(app).get("/api/v1/notes");
      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it("reports the remaining requests in headers", async () => {
    await request(firstApp).get("/api/v1/notes");
    const response = await request(secondApp).get("/api/v1/notes");

    expect(response.headers["ratelimit-remaining"]).toBe(String(LIMIT - 2));
  });

  it("keeps counters in Redis that expire with the window", async () => {
    await request(firstApp).get("/api/v1/notes");
    await request(secondApp).get("/api/v1/notes");

    const redis = first.infrastructure.redis;
    const keys = (await redis.sendCommand(["KEYS", "rl:api:*"])) as string[];

    expect(keys).toHaveLength(1);
    expect(await redis.sendCommand(["GET", keys[0]!])).toBe("2");

    const ttlMs = (await redis.sendCommand(["PTTL", keys[0]!])) as number;

    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(60_000);
  });

  it("lets requests through when Redis is down", async () => {
    const responses = await Promise.all(
      Array.from({ length: LIMIT + 2 }, () =>
        request(withoutRedisApp).get("/api/v1/notes"),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: LIMIT + 2 }, () => 401),
    );
  });

  it("stays ready when Redis is down, and says so", async () => {
    const up = await request(firstApp).get("/ready");
    const down = await request(withoutRedisApp).get("/ready");

    expect(up.status).toBe(200);
    expect(up.body).toEqual({
      status: "ready",
      database: "up",
      redis: "up",
    });

    expect(down.status).toBe(200);
    expect(down.body).toEqual({
      status: "ready",
      database: "up",
      redis: "down",
    });
  });
});
