import { createContainer } from "./app/container.js";
import { createApp } from "./app.js";
import { createConfig } from "./config/config.js";
import { createEnv } from "./config/env.js";
import { createLogger } from "./infrastructure/createLogger.js";
import { startServer } from "./server/startServer.js";

const start = async (): Promise<void> => {
  const env = createEnv();
  const config = createConfig(env);

  const container = createContainer(config);

  await container.infrastructure.database.healthCheck();

  const app = createApp(container);

  startServer({
    app,
    container,
  });
};

start().catch((error: unknown) => {
  createLogger().error("Application failed to start", {
    error,
  });

  process.exit(1);
});
