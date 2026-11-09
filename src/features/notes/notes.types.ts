export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

// An undefined title or content leaves the stored value unchanged.
export type UpdateNoteData = Pick<Note, "id" | "updatedAt"> & {
  title: string | undefined;
  content: string | undefined;
};

export type NotesSortField = "createdAt" | "updatedAt" | "title";

export type SortOrder = "asc" | "desc";

export type NotesQueryOptions = {
  page: number;
  pageSize: number;

  search?: string;
  title?: string;

  sortBy: NotesSortField;
  sortOrder: SortOrder;
};
