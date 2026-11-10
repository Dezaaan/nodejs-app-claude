import type { Note, NotesQueryOptions, UpdateNoteData } from "./notes.types.js";

export type NotesRepository = {
  create(note: Note): Promise<Note>;

  deleteById(id: string): Promise<boolean>;

  findMany(options: NotesQueryOptions): Promise<{
    items: Note[];
    totalItems: number;
  }>;

  findById(id: string): Promise<Note | null>;

  update(note: UpdateNoteData): Promise<Note | null>;
};
