import type { AppConfig } from "../config/config.js";
import type { Infrastructure } from "../infrastructure/createInfrastructure.js";
import { createAuthFeature } from "./auth/auth.feature.js";
import { createNotesFeature } from "./notes/notes.feature.js";

export const createFeatures = (
  infrastructure: Infrastructure,
  config: AppConfig,
) => {
  const auth = createAuthFeature({
    database: infrastructure.database,
    logger: infrastructure.logger,
    config: config.auth,
  });

  const notes = createNotesFeature({
    database: infrastructure.database,
    logger: infrastructure.logger,
  });

  return {
    auth,
    notes,
  };
};
