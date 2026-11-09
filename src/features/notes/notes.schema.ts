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
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: "At least one field must be provided",
  });

export const noteIdParamsSchema = z.object({
  id: z.uuid(),
});

export const notesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "title"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export type NoteIdParams = z.infer<typeof noteIdParamsSchema>;

export type NotesQuery = z.infer<typeof notesQuerySchema>;
