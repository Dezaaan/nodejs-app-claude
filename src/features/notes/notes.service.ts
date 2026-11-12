import type { Note, NotesQueryOptions } from "./notes.types.js";
import type { CreateNoteInput, UpdateNoteInput } from "./notes.schema.js";
import type { Logger } from "../../infrastructure/createLogger.js";
import { NotFoundError } from "../../shared/errors/NotFoundError.js";
import type { NotesRepository } from "./notes.repository.js";
import type { PaginatedResult } from "../../shared/pagination/pagination.types.js";
import { createPaginatedResult } from "../../shared/pagination/createPaginatedResult.js";

// Every method acts on behalf of one user. Another user's note is reported as
// not found, so its existence isn't revealed.
export type NotesService = {
  createNote(userId: string, input: CreateNoteInput): Promise<Note>;

  getNotes(
    userId: string,
    options: NotesQueryOptions,
  ): Promise<PaginatedResult<Note>>;

  getNoteById(userId: string, id: string): Promise<Note>;

  updateNote(userId: string, id: string, input: UpdateNoteInput): Promise<Note>;

  deleteNote(userId: string, id: string): Promise<void>;
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
    userId: string,
    options: NotesQueryOptions,
  ): Promise<PaginatedResult<Note>> => {
    const { items, totalItems } = await notesRepository.findMany(
      userId,
      options,
    );

    return createPaginatedResult({
      items,
      totalItems,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
      },
    });
  };

  const getNoteById = async (userId: string, id: string): Promise<Note> => {
    const note = await notesRepository.findById(userId, id);

    if (!note) {
      throw new NotFoundError("Note not found");
    }

    return note;
  };

  const createNote = async (
    userId: string,
    input: CreateNoteInput,
  ): Promise<Note> => {
    const now = new Date();

    const note: Note = {
      id: crypto.randomUUID(),
      userId,
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
    userId: string,
    id: string,
    input: UpdateNoteInput,
  ): Promise<Note> => {
    const updatedNote = await notesRepository.update({
      id,
      userId,
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

  const deleteNote = async (userId: string, id: string): Promise<void> => {
    const deleted = await notesRepository.deleteById(userId, id);

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
