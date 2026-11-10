import type { Note, NotesQueryOptions } from "./notes.types.js";
import type { CreateNoteInput, UpdateNoteInput } from "./notes.schema.js";
import type { Logger } from "../../infrastructure/createLogger.js";
import { NotFoundError } from "../../shared/errors/NotFoundError.js";
import type { NotesRepository } from "./notes.repository.js";
import type { PaginatedResult } from "../../shared/pagination/pagination.types.js";
import { createPaginatedResult } from "../../shared/pagination/createPaginatedResult.js";

export type NotesService = {
  createNote(input: CreateNoteInput): Promise<Note>;

  getNotes(options: NotesQueryOptions): Promise<PaginatedResult<Note>>;

  getNoteById(id: string): Promise<Note>;

  updateNote(id: string, input: UpdateNoteInput): Promise<Note>;

  deleteNote(id: string): Promise<void>;
};

type CreateNotesServiceDependencies = {
  notesRepository: NotesRepository;
  logger: Logger;
};

export const createNotesService = ({
  notesRepository,
  logger,
}: CreateNotesServiceDependencies): NotesService => {
  const getNotes = async (
    options: NotesQueryOptions,
  ): Promise<PaginatedResult<Note>> => {
    const { items, totalItems } = await notesRepository.findMany(options);

    return createPaginatedResult({
      items,
      totalItems,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
      },
    });
  };
  const getNoteById = async (id: string): Promise<Note> => {
    const note = await notesRepository.findById(id);

    if (!note) {
      throw new NotFoundError("Note not found");
    }

    return note;
  };

  const createNote = async (input: CreateNoteInput): Promise<Note> => {
    const now = new Date();

    const note: Note = {
      id: crypto.randomUUID(),
      title: input.title,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    };

    const createdNote = await notesRepository.create(note);

    logger.info("Note created", {
      noteId: createdNote.id,
    });

    return createdNote;
  };

  const updateNote = async (
    id: string,
    input: UpdateNoteInput,
  ): Promise<Note> => {
    const updatedNote = await notesRepository.update({
      id,
      title: input.title,
      content: input.content,
      updatedAt: new Date(),
    });

    if (!updatedNote) {
      throw new NotFoundError("Note not found");
    }

    logger.info("Note updated", {
      noteId: id,
    });

    return updatedNote;
  };

  const deleteNote = async (id: string): Promise<void> => {
    const deleted = await notesRepository.deleteById(id);

    if (!deleted) {
      throw new NotFoundError("Note not found");
    }

    logger.info("Note deleted", {
      noteId: id,
    });
  };

  return {
    createNote,
    deleteNote,
    getNoteById,
    getNotes,
    updateNote,
  };
};
