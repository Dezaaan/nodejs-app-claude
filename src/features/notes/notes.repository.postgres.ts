import type { Database } from "../../infrastructure/database/database.types.js";
import type { NotesRepository } from "./notes.repository.js";
import type {
  Note,
  NotesFilters,
  NotesQueryOptions,
  UpdateNoteData,
} from "./notes.types.js";

type NoteRow = Pick<Note, "id" | "title" | "content"> & {
  user_id: string;
  created_at: Date;
  updated_at: Date;
};

const mapNoteRowToDomain = (row: NoteRow): Note => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const NOTE_COLUMNS = "id, user_id, title, content, created_at, updated_at";

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

// Builds the WHERE conditions shared by the page and count queries. Every
// condition starts with user_id, which all notes indexes lead with.
const buildFilters = (userId: string, filters: NotesFilters) => {
  const params: unknown[] = [userId];
  const conditions: string[] = ["user_id = $1"];

  if (filters.search) {
    params.push(toContainsPattern(filters.search));

    conditions.push(
      `(title ILIKE $${params.length} OR content ILIKE $${params.length})`,
    );
  }

  if (filters.title) {
    params.push(toContainsPattern(filters.title));

    conditions.push(`title ILIKE $${params.length}`);
  }

  return { params, conditions };
};

export const createPostgresNotesRepository = ({
  database,
}: CreatePostgresNotesRepositoryDependencies): NotesRepository => {
  const findMany = async (userId: string, options: NotesQueryOptions) => {
    const { params, conditions } = buildFilters(userId, options);

    const sortColumn = sortColumnMap[options.sortBy];
    const descending = options.sortOrder === "desc";
    const sortOrder = descending ? "DESC" : "ASC";
    const { position } = options;

    if (position.kind === "after") {
      // Keyset pagination: start right after the cursor's note. The index on
      // (user_id, <sort column>, id) finds that spot directly, so page 1,000
      // costs the same as page 1.
      params.push(position.value, position.id);

      const valueParam =
        options.sortBy === "title"
          ? `$${params.length - 1}`
          : `$${params.length - 1}::timestamptz`;

      conditions.push(
        `(${sortColumn}, id) ${descending ? "<" : ">"} (${valueParam}, $${params.length}::uuid)`,
      );
    }

    // One extra row tells whether another page follows.
    params.push(options.pageSize + 1);
    const limitParam = `$${params.length}`;

    let offsetClause = "";

    if (position.kind === "page") {
      // OFFSET still reads and skips every earlier row: fine for the first
      // pages, slow deep into a large list. Cursors avoid that.
      params.push((position.page - 1) * options.pageSize);
      offsetClause = `OFFSET $${params.length}`;
    }

    const result = await database.query<NoteRow>(
      `
        SELECT ${NOTE_COLUMNS}
        FROM notes
        WHERE ${conditions.join(" AND ")}
        ORDER BY ${sortColumn} ${sortOrder}, id ${sortOrder}
        LIMIT ${limitParam}
        ${offsetClause}
      `,
      params,
    );

    const hasMore = result.rows.length > options.pageSize;
    const rows = hasMore ? result.rows.slice(0, options.pageSize) : result.rows;

    return {
      items: rows.map(mapNoteRowToDomain),
      hasMore,
    };
  };

  const countMany = async (
    userId: string,
    filters: NotesFilters,
    limit: number,
  ): Promise<number> => {
    const { params, conditions } = buildFilters(userId, filters);

    params.push(limit);

    const result = await database.query<{ count: number }>(
      `
        SELECT count(*)::int AS count
        FROM (
          SELECT 1
          FROM notes
          WHERE ${conditions.join(" AND ")}
          LIMIT $${params.length}
        ) AS limited
      `,
      params,
    );

    return result.rows[0]?.count ?? 0;
  };

  const findById = async (userId: string, id: string): Promise<Note | null> => {
    const result = await database.query<NoteRow>(
      `
        SELECT ${NOTE_COLUMNS}
        FROM notes
        WHERE id = $1 AND user_id = $2
      `,
      [id, userId],
    );

    const row = result.rows[0];

    return row ? mapNoteRowToDomain(row) : null;
  };

  const create = async (note: Note): Promise<Note> => {
    const result = await database.query<NoteRow>(
      `
        INSERT INTO notes (${NOTE_COLUMNS})
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING ${NOTE_COLUMNS}
      `,
      [
        note.id,
        note.userId,
        note.title,
        note.content,
        note.createdAt,
        note.updatedAt,
      ],
    );

    return mapNoteRowToDomain(result.rows[0]!);
  };

  const update = async (note: UpdateNoteData): Promise<Note | null> => {
    const result = await database.query<NoteRow>(
      `
      UPDATE notes
      SET
        title = COALESCE($3, title),
        content = COALESCE($4, content),
        updated_at = $5
      WHERE id = $1 AND user_id = $2
      RETURNING ${NOTE_COLUMNS}
    `,
      [
        note.id,
        note.userId,
        note.title ?? null,
        note.content ?? null,
        note.updatedAt,
      ],
    );

    const row = result.rows[0];

    return row ? mapNoteRowToDomain(row) : null;
  };

  const deleteById = async (userId: string, id: string): Promise<boolean> => {
    const result = await database.query(
      `
      DELETE FROM notes
      WHERE id = $1 AND user_id = $2
    `,
      [id, userId],
    );

    return (result.rowCount ?? 0) > 0;
  };

  return {
    countMany,
    create,
    deleteById,
    findMany,
    findById,
    update,
  };
};
