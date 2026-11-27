import { z } from "zod";
import type { Note, NotesFilters, NotesSort } from "./notes.types.js";

// A cursor marks the last note of a page: the next page starts right after
// it. It also carries the sort and filters it was made for, so a client only
// sends the cursor back and can't mix it with a different query, which would
// silently skip or repeat notes.
//
// Cursors are opaque to clients but not secret: they hold nothing beyond the
// caller's own query, and every query is still limited to their own notes.
const cursorSchema = z
  .object({
    sortBy: z.enum(["createdAt", "updatedAt", "title"]),
    sortOrder: z.enum(["asc", "desc"]),
    search: z.string().optional(),
    title: z.string().optional(),
    // The last note's sort value (an ISO timestamp or a title) and its id,
    // which breaks ties between notes with the same sort value.
    value: z.string(),
    id: z.uuid(),
  })
  .strict()
  .refine(
    (cursor) =>
      cursor.sortBy === "title" ||
      z.iso.datetime().safeParse(cursor.value).success,
    "value must be a timestamp",
  );

export type NotesCursor = NotesSort &
  NotesFilters & {
    value: string;
    id: string;
  };

export const encodeNotesCursor = (cursor: NotesCursor): string =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

// Returns null for anything that isn't a cursor this API created.
export const decodeNotesCursor = (text: string): NotesCursor | null => {
  try {
    const json: unknown = JSON.parse(
      Buffer.from(text, "base64url").toString("utf8"),
    );
    const result = cursorSchema.safeParse(json);

    if (!result.success) {
      return null;
    }

    const { search, title, ...rest } = result.data;

    return {
      ...rest,
      ...(search !== undefined && { search }),
      ...(title !== undefined && { title }),
    };
  } catch {
    return null;
  }
};

// Timestamps are compared at millisecond precision. The app only writes
// JavaScript dates, which have no finer precision, so the value in the
// cursor equals the stored one exactly.
const sortValueOf = (note: Note, sortBy: NotesSort["sortBy"]): string =>
  sortBy === "title" ? note.title : note[sortBy].toISOString();

export const cursorAfter = (
  note: Note,
  sort: NotesSort,
  filters: NotesFilters,
): string =>
  encodeNotesCursor({
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    ...(filters.search !== undefined && { search: filters.search }),
    ...(filters.title !== undefined && { title: filters.title }),
    value: sortValueOf(note, sort.sortBy),
    id: note.id,
  });
