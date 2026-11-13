import type { Logger } from "../../infrastructure/createLogger.js";
import type { RefreshTokensRepository } from "./auth.repository.js";

export type RefreshTokenCleanup = {
  // Stops the schedule and waits for a run in progress, so the database can
  // be closed safely afterwards.
  stop(): Promise<void>;
};

type StartRefreshTokenCleanupOptions = {
  refreshTokensRepository: RefreshTokensRepository;
  logger: Logger;
  intervalMs: number;
};

// Deletes expired refresh tokens now and then every `intervalMs`. Running it
// on several app instances at once is harmless: each DELETE skips rows that
// another one already removed.
export const startRefreshTokenCleanup = ({
  refreshTokensRepository,
  logger,
  intervalMs,
}: StartRefreshTokenCleanupOptions): RefreshTokenCleanup => {
  let running: Promise<void> | null = null;

  const run = (): void => {
    // Skip a tick if the previous run is still going.
    if (running) {
      return;
    }

    running = refreshTokensRepository
      .deleteExpired(new Date())
      .then((deleted) => {
        if (deleted > 0) {
          logger.info("Expired refresh tokens deleted", { deleted });
        }
      })
      .catch((error: unknown) => {
        // A failed run is retried at the next tick; it must not crash the app.
        logger.error("Refresh token cleanup failed", { error });
      })
      .finally(() => {
        running = null;
      });
  };

  run();

  // unref() so this timer never keeps the process alive on its own.
  const timer = setInterval(run, intervalMs).unref();

  const stop = async (): Promise<void> => {
    clearInterval(timer);

    await running;
  };

  return { stop };
};
