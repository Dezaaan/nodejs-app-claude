import type { AppConfig } from "../config/config.js";
import { createFeatures } from "../features/createFeatures.js";
import { createInfrastructure } from "../infrastructure/createInfrastructure.js";

export const createContainer = (config: AppConfig) => {
  const infrastructure = createInfrastructure(config);
  const features = createFeatures(infrastructure, config);

  return {
    config,
    infrastructure,
    features,
  };
};
