import type { Express } from "express";
import { AppContainer } from "../app/container.types.js";

type StartServerDependencies = {
  app: Express;
  container: AppContainer;
};

export const startServer = ({ app, container }: StartServerDependencies) => {
  const {
    config,
    infrastructure: { database, logger },
  } = container;

  // Express 5 also calls this callback when listening fails.
  const server = app.listen(config.app.port, (error) => {
    if (error) {
      logger.error("Failed to start HTTP server", {
        error,
        port: config.app.port,
      });

      process.exit(1);
    }

    logger.info("Application started", {
      port: config.app.port,
      environment: config.app.environment,
    });
  });

  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info("Shutdown started", {
      signal,
    });

    server.close(async (serverError) => {
      if (serverError) {
        logger.error("Failed to close HTTP server", {
          error: serverError,
        });

        process.exit(1);
      }

      try {
        await database.close();

        logger.info("Database connection closed");

        logger.info("Application stopped successfully");

        process.exit(0);
      } catch (error) {
        logger.error("Failed during application shutdown", {
          error,
        });

        process.exit(1);
      }
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  return server;
};
