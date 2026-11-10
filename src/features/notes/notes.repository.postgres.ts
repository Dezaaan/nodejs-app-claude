import type { Database } from "../../infrastructure/database/database.types.js";
import type { NotesRepository } from "./notes.repository.js";
import type { Note, NotesQueryOptions, UpdateNoteData } from "./notes.types.js";

type NoteRow = Pick<Note, "id" | "title" | "content"> & {
  created_at: Date;
  updated_at: Date;
};

const mapNoteRowToDomain = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type CreatePostgresNotesRepositoryDependencies = {
  database: Database;
};

const sortColumnMap = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  title: "title",
} as const;

// Escapes LIKE metacharacters so user input only matches literally.
const toContainsPattern = (value: string): string =>
  `%${value.replace(/[\\%_]/g, "\\$&")}%`;

export const createPostgresNotesRepository = ({
  database,
}: CreatePostgresNotesRepositoryDependencies): NotesRepository => {
  const findMany = async (options: NotesQueryOptions) => {
    const offset = (options.page - 1) * options.pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.search) {
      params.push(toContainsPattern(options.search));

      const parameterIndex = params.length;

      conditions.push(
        `(
          title ILIKE $${parameterIndex}
          OR content ILIKE $${parameterIndex}
        )`,
      );
    }

    if (options.title) {
      params.push(toContainsPattern(options.title));

      conditions.push(`title ILIKE $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortColumn = sortColumnMap[options.sortBy];

    const sortOrder = options.sortOrder === "asc" ? "ASC" : "DESC";

    params.push(options.pageSize);
    const limitIndex = params.length;

    params.push(offset);
    const offsetIndex = params.length;

    const notesResult = await database.query<NoteRow>(
      `
          SELECT
            id,
            title,
            content,
            created_at,
            updated_at
          FROM notes
          ${whereClause}
          ORDER BY ${sortColumn} ${sortOrder}, id ${sortOrder}
          LIMIT $${limitIndex}
          OFFSET $${offsetIndex}
        `,
      params,
    );

    const countParams = params.slice(0, -2);

    const countResult = await database.query<{
      count: string;
    }>(
      `
          SELECT COUNT(*) AS count
          FROM notes
          ${whereClause}
        `,
      countParams,
    );

    return {
      items: notesResult.rows.map(mapNoteRowToDomain),

      totalItems: Number(countResult.rows[0]?.count ?? 0),
    };
  };

  const findById = async (id: string): Promise<Note | null> => {
    const result = await database.query<NoteRow>(
      `
        SELECT
          id,
          title,
          content,
          created_at,
          updated_at
        FROM notes
        WHERE id = $1
      `,
      [id],
    );

    const row = result.rows[0];

    return row ? mapNoteRowToDomain(row) : null;
  };

  const create = async (note: Note): Promise<Note> => {
    const result = await database.query<NoteRow>(
      `
        INSERT INTO notes (
          id,
          title,
          content,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          title,
          content,
          created_at,
          updated_at
      `,
      [note.id, note.title, note.content, note.createdAt, note.updatedAt],
    );

    return mapNoteRowToDomain(result.rows[0]!);
  };

  const update = async (note: UpdateNoteData): Promise<Note | null> => {
    const result = await database.query<NoteRow>(
      `
      UPDATE notes
      SET
        title = COALESCE($2, title),
        content = COALESCE($3, content),
        updated_at = $4
      WHERE id = $1
      RETURNING
        id,
        title,
        content,
        created_at,
        updated_at
    `,
      [note.id, note.title ?? null, note.content ?? null, note.updatedAt],
    );

    const row = result.rows[0];

    return row ? mapNoteRowToDomain(row) : null;
  };

  const deleteById = async (id: string): Promise<boolean> => {
    const result = await database.query(
      `
      DELETE FROM notes
      WHERE id = $1
    `,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  };

  return {
    create,
    deleteById,
    findMany,
    findById,
    update,
  };
};
