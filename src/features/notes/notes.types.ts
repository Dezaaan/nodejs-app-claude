export type Note = {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

// An undefined title or content leaves the stored value unchanged.
export type UpdateNoteData = Pick<Note, "id" | "userId" | "updatedAt"> & {
  title: string | undefined;
  content: string | undefined;
};

export type NotesSortField = "createdAt" | "updatedAt" | "title";

export type SortOrder = "asc" | "desc";

export type NotesSort = {
  sortBy: NotesSortField;
  sortOrder: SortOrder;
};

export type NotesFilters = {
  // Matches title or content.
  search?: string;
  title?: string;
};

// Where a page starts: a page number, or right after a given note (cursor).
export type NotesPosition =
  { kind: "page"; page: number } | { kind: "after"; value: string; id: string };

export type NotesQueryOptions = NotesSort &
  NotesFilters & {
    pageSize: number;
    position: NotesPosition;
  };
