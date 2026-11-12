import type { Note, NotesQueryOptions, UpdateNoteData } from "./notes.types.js";

// Every method is scoped to one user: notes owned by anyone else behave as if
// they don't exist.
export type NotesRepository = {
  create(note: Note): Promise<Note>;

  deleteById(userId: string, id: string): Promise<boolean>;

  findMany(
    userId: string,
    options: NotesQueryOptions,
  ): Promise<{
    items: Note[];
    totalItems: number;
  }>;

  findById(userId: string, id: string): Promise<Note | null>;

  update(note: UpdateNoteData): Promise<Note | null>;
};
