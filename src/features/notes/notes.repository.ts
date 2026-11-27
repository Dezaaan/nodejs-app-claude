import type {
  Note,
  NotesFilters,
  NotesQueryOptions,
  UpdateNoteData,
} from "./notes.types.js";

// Every method is scoped to one user: notes owned by anyone else behave as if
// they don't exist.
export type NotesRepository = {
  create(note: Note): Promise<Note>;

  deleteById(userId: string, id: string): Promise<boolean>;

  // `hasMore` says whether another page follows this one.
  findMany(
    userId: string,
    options: NotesQueryOptions,
  ): Promise<{
    items: Note[];
    hasMore: boolean;
  }>;

  // Counts matching notes, but stops at `limit`: the cost of counting grows
  // with the number of matches, and a user can have tens of thousands.
  countMany(
    userId: string,
    filters: NotesFilters,
    limit: number,
  ): Promise<number>;

  findById(userId: string, id: string): Promise<Note | null>;

  update(note: UpdateNoteData): Promise<Note | null>;
};
