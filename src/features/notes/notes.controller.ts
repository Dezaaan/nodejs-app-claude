import type { RequestHandler } from "express";

import { getAuth } from "../../shared/http/authContext.js";
import { mapPaginatedResult } from "../../shared/mapping/mapPaginatedResult.js";
import { validatedHandler } from "../../shared/http/validatedHandler.js";
import {
  mapNotesQueryToOptions,
  mapNoteToResponseDto,
} from "./notes.mapper.js";
import {
  createNoteSchema,
  noteIdParamsSchema,
  notesQuerySchema,
  updateNoteSchema,
} from "./notes.schema.js";
import type { NotesService } from "./notes.service.js";

export type NotesController = {
  getNotes: RequestHandler;
  getNoteById: RequestHandler;
  createNote: RequestHandler;
  updateNote: RequestHandler;
  deleteNote: RequestHandler;
};

type CreateNotesControllerDependencies = {
  notesService: NotesService;
};

// Routes using this controller must be mounted behind requireAuth.
export const createNotesController = ({
  notesService,
}: CreateNotesControllerDependencies): NotesController => {
  const getNotes = validatedHandler(
    { query: notesQuerySchema },
    async ({ query }, response) => {
      const result = await notesService.getNotes(
        getAuth(response).userId,
        mapNotesQueryToOptions(query),
      );

      response
        .status(200)
        .json(mapPaginatedResult(result, mapNoteToResponseDto));
    },
  );

  const getNoteById = validatedHandler(
    { params: noteIdParamsSchema },
    async ({ params }, response) => {
      const note = await notesService.getNoteById(
        getAuth(response).userId,
        params.id,
      );

      response.status(200).json(mapNoteToResponseDto(note));
    },
  );

  const createNote = validatedHandler(
    { body: createNoteSchema },
    async ({ body }, response) => {
      const note = await notesService.createNote(
        getAuth(response).userId,
        body,
      );

      response.status(201).json(mapNoteToResponseDto(note));
    },
  );

  const updateNote = validatedHandler(
    { params: noteIdParamsSchema, body: updateNoteSchema },
    async ({ params, body }, response) => {
      const note = await notesService.updateNote(
        getAuth(response).userId,
        params.id,
        body,
      );

      response.status(200).json(mapNoteToResponseDto(note));
    },
  );

  const deleteNote = validatedHandler(
    { params: noteIdParamsSchema },
    async ({ params }, response) => {
      await notesService.deleteNote(getAuth(response).userId, params.id);

      response.status(204).send();
    },
  );

  return {
    createNote,
    deleteNote,
    getNoteById,
    getNotes,
    updateNote,
  };
};
