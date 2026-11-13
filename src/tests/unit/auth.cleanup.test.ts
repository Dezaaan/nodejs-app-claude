import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRefreshTokenCleanup } from "../../features/auth/auth.cleanup.js";
import type { RefreshTokensRepository } from "../../features/auth/auth.repository.js";
import { createTestLogger } from "../helpers/createTestLogger.js";

const HOUR = 60 * 60 * 1000;

const createRepository = (
  deleteExpired: RefreshTokensRepository["deleteExpired"],
): RefreshTokensRepository => ({
  create: vi.fn(),
  consume: vi.fn(),
  findByHash: vi.fn(),
  revokeFamily: vi.fn(),
  deleteExpired: vi.fn(deleteExpired),
});

describe("startRefreshTokenCleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs at start and then on every interval", async () => {
    const repository = createRepository(async () => 3);
    const logger = createTestLogger();

    const cleanup = startRefreshTokenCleanup({
      refreshTokensRepository: repository,
      logger,
      intervalMs: HOUR,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(repository.deleteExpired).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Expired refresh tokens deleted", {
      deleted: 3,
    });

    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(repository.deleteExpired).toHaveBeenCalledTimes(3);

    await cleanup.stop();
  });

  it("logs nothing when there was nothing to delete", async () => {
    const logger = createTestLogger();

    const cleanup = startRefreshTokenCleanup({
      refreshTokensRepository: createRepository(async () => 0),
      logger,
      intervalMs: HOUR,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(logger.info).not.toHaveBeenCalled();

    await cleanup.stop();
  });

  it("logs a failure and tries again at the next interval", async () => {
    const error = new Error("database unavailable");
    const repository = createRepository(async () => {
      throw error;
    });
    const logger = createTestLogger();

    const cleanup = startRefreshTokenCleanup({
      refreshTokensRepository: repository,
      logger,
      intervalMs: HOUR,
    });

    await vi.advanceTimersByTimeAsync(HOUR);

    expect(logger.error).toHaveBeenCalledWith("Refresh token cleanup failed", {
      error,
    });
    expect(repository.deleteExpired).toHaveBeenCalledTimes(2);

    await cleanup.stop();
  });

  it("does not start a run while the previous one is still going", async () => {
    // Each run takes longer than the interval.
    const repository = createRepository(
      () => new Promise((resolve) => setTimeout(() => resolve(0), 1.5 * HOUR)),
    );

    const cleanup = startRefreshTokenCleanup({
      refreshTokensRepository: repository,
      logger: createTestLogger(),
      intervalMs: HOUR,
    });

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(repository.deleteExpired).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(repository.deleteExpired).toHaveBeenCalledTimes(2);

    // The second run is still in progress; let it finish so stop() returns.
    const stopping = cleanup.stop();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    await stopping;

    expect(repository.deleteExpired).toHaveBeenCalledTimes(2);
  });

  it("stops running after stop()", async () => {
    const repository = createRepository(async () => 0);

    const cleanup = startRefreshTokenCleanup({
      refreshTokensRepository: repository,
      logger: createTestLogger(),
      intervalMs: HOUR,
    });

    await cleanup.stop();
    await vi.advanceTimersByTimeAsync(5 * HOUR);

    expect(repository.deleteExpired).toHaveBeenCalledTimes(1);
  });

  it("waits for a run in progress when stopping", async () => {
    let finish!: () => void;
    const repository = createRepository(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(0);
        }),
    );

    const cleanup = startRefreshTokenCleanup({
      refreshTokensRepository: repository,
      logger: createTestLogger(),
      intervalMs: HOUR,
    });

    let stopped = false;
    const stopping = cleanup.stop().then(() => {
      stopped = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    finish();
    await stopping;
    expect(stopped).toBe(true);
  });
});
