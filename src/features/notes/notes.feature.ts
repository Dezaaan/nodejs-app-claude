import type { Logger } from "../../infrastructure/createLogger.js";
import type { Database } from "../../infrastructure/database/database.types.js";
import type { NotesController } from "./notes.controller.js";
import { createNotesController } from "./notes.controller.js";
import { createPostgresNotesRepository } from "./notes.repository.postgres.js";
import type { NotesService } from "./notes.service.js";
import { createNotesService } from "./notes.service.js";

export type NotesFeature = {
  service: NotesService;
  controller: NotesController;
};

type CreateNotesFeatureDependencies = {
  database: Database;
  logger: Logger;
};

export const createNotesFeature = ({
  database,
  logger,
}: CreateNotesFeatureDependencies): NotesFeature => {
  const repository = createPostgresNotesRepository({
    database,
  });

  const service = createNotesService({
    notesRepository: repository,
    logger: logger,
  });

  const controller = createNotesController({
    notesService: service,
  });

  return {
    service,
    controller,
  };
};
