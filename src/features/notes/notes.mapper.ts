import { BadRequestError } from "../../shared/errors/BadRequestError.js";
import { decodeNotesCursor } from "./notes.cursor.js";
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

const DEFAULT_SORT = { sortBy: "createdAt", sortOrder: "desc" } as const;

export const mapNotesQueryToOptions = (
  query: NotesQuery,
): NotesQueryOptions => {
  if (query.cursor === undefined) {
    return {
      pageSize: query.pageSize,
      sortBy: query.sortBy ?? DEFAULT_SORT.sortBy,
      sortOrder: query.sortOrder ?? DEFAULT_SORT.sortOrder,
      ...(query.search !== undefined && { search: query.search }),
      ...(query.title !== undefined && { title: query.title }),
      position: { kind: "page", page: query.page ?? 1 },
    };
  }

  const cursor = decodeNotesCursor(query.cursor);

  if (!cursor) {
    throw new BadRequestError("INVALID_CURSOR", "The cursor is not valid");
  }

  // The cursor carries the sort and filters. Repeating them is allowed (a
  // client may resend its whole query), but changing them is not.
  const conflicts = (["sortBy", "sortOrder", "search", "title"] as const).some(
    (key) => query[key] !== undefined && query[key] !== cursor[key],
  );

  if (conflicts) {
    throw new BadRequestError(
      "CURSOR_MISMATCH",
      "The cursor belongs to a different sort or search; start again without it",
    );
  }

  return {
    pageSize: query.pageSize,
    sortBy: cursor.sortBy,
    sortOrder: cursor.sortOrder,
    ...(cursor.search !== undefined && { search: cursor.search }),
    ...(cursor.title !== undefined && { title: cursor.title }),
    position: { kind: "after", value: cursor.value, id: cursor.id },
  };
};
