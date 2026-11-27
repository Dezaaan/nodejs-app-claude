import type { Note, NotesFilters, NotesQueryOptions } from "./notes.types.js";
import type { CreateNoteInput, UpdateNoteInput } from "./notes.schema.js";
import type { Logger } from "../../infrastructure/createLogger.js";
import { NotFoundError } from "../../shared/errors/NotFoundError.js";
import type { NotesRepository } from "./notes.repository.js";
import type { PaginatedResult } from "../../shared/pagination/pagination.types.js";
import { cursorAfter } from "./notes.cursor.js";

// Page-number responses count matching notes up to this many. Counting
// costs as much as reading every match: for a user with 59,000 notes an
// exact count took 47 ms, and 590 ms with a search.
export const MAX_COUNTED_NOTES = 1_000;

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
    const { position, pageSize } = options;
    const filters: NotesFilters = {
      ...(options.search !== undefined && { search: options.search }),
      ...(options.title !== undefined && { title: options.title }),
    };

    const nextCursorFor = (items: Note[], hasMore: boolean) => {
      const last = items.at(-1);

      return hasMore && last ? cursorAfter(last, options, filters) : null;
    };

    if (position.kind === "after") {
      // Cursor pages have no total: skipping the count is what keeps every
      // page as cheap as the first.
      const { items, hasMore } = await notesRepository.findMany(
        userId,
        options,
      );

      return {
        items,
        pagination: { pageSize, nextCursor: nextCursorFor(items, hasMore) },
      };
    }

    // One more than the limit shows whether the total was cut off.
    const [{ items, hasMore }, counted] = await Promise.all([
      notesRepository.findMany(userId, options),
      notesRepository.countMany(userId, filters, MAX_COUNTED_NOTES + 1),
    ]);

    const totalItemsCapped = counted > MAX_COUNTED_NOTES;
    const totalItems = Math.min(counted, MAX_COUNTED_NOTES);

    return {
      items,
      pagination: {
        page: position.page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
        totalItemsCapped,
        nextCursor: nextCursorFor(items, hasMore),
      },
    };
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
