import { z } from "zod";

export const createNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1),
  })
  .strict();

export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: "At least one field must be provided",
  });

export const noteIdParamsSchema = z.object({
  id: z.uuid(),
});

// Two ways to page: `page` (default 1), or `cursor` from a previous
// response's `nextCursor`. Sort defaults to createdAt desc; with a cursor,
// the sort and filters come from the cursor.
export const notesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    cursor: z.string().min(1).max(2_000).optional(),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().min(1).max(200).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "title"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  })
  .refine((query) => query.page === undefined || query.cursor === undefined, {
    message: "Use either page or cursor, not both",
    path: ["cursor"],
  });

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export type NoteIdParams = z.infer<typeof noteIdParamsSchema>;

export type NotesQuery = z.infer<typeof notesQuerySchema>;
