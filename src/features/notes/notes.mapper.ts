import type { NoteResponseDto } from "./notes.dto.js";
import type { NotesQuery } from "./notes.schema.js";
import type { Note, NotesQueryOptions } from "./notes.types.js";

export const mapNoteToResponseDto = (note: Note): NoteResponseDto => ({
  id: note.id,
  title: note.title,
  content: note.content,
  createdAt: note.createdAt.toISOString(),
  updatedAt: note.updatedAt.toISOString(),
});

export const mapNotesQueryToOptions = (
  query: NotesQuery,
): NotesQueryOptions => ({
  page: query.page,
  pageSize: query.pageSize,
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,

  ...(query.search !== undefined && {
    search: query.search,
  }),

  ...(query.title !== undefined && {
    title: query.title,
  }),
});
