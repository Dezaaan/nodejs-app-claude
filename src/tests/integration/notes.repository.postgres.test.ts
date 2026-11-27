import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresUsersRepository } from "../../features/auth/auth.repository.postgres.js";
import { createPostgresNotesRepository } from "../../features/notes/notes.repository.postgres.js";
import type {
  Note,
  NotesQueryOptions,
  NotesSort,
} from "../../features/notes/notes.types.js";
import { createTestDatabase } from "../helpers/createTestDatabase.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

const database = createTestDatabase();

const repository = createPostgresNotesRepository({
  database,
});

const usersRepository = createPostgresUsersRepository({ database });

const defaultOptions: NotesQueryOptions = {
  pageSize: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
  position: { kind: "page", page: 1 },
};

const createUser = async (): Promise<string> => {
  const now = new Date();
  const user = await usersRepository.create({
    id: randomUUID(),
    email: `user-${randomUUID()}@example.com`,
    passwordHash: "not-a-real-hash",
    role: "user",
    createdAt: now,
    updatedAt: now,
  });

  return user!.id;
};

describe("PostgresNotesRepository", () => {
  let userId: string;

  const buildNote = (overrides: Partial<Note> = {}): Note => {
    const now = new Date();

    return {
      id: randomUUID(),
      userId,
      title: "Title",
      content: "Content",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  };

  beforeEach(async () => {
    await resetDatabase(database);

    userId = await createUser();
  });

  afterAll(async () => {
    await database.close();
  });

  it("creates a note", async () => {
    const note = buildNote({
      title: "Integration test",
      content: "PostgreSQL content",
    });

    const result = await repository.create(note);

    expect(result).toEqual(note);
  });

  it("finds all notes", async () => {
    await repository.create(buildNote({ title: "Note one" }));
    await repository.create(buildNote({ title: "Note two" }));

    const result = await repository.findMany(userId, defaultOptions);

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(await repository.countMany(userId, {}, 100)).toBe(2);
  });

  it("says whether another page follows", async () => {
    for (let index = 0; index < 3; index++) {
      await repository.create(buildNote());
    }

    const first = await repository.findMany(userId, {
      ...defaultOptions,
      pageSize: 2,
    });
    const second = await repository.findMany(userId, {
      ...defaultOptions,
      pageSize: 2,
      position: { kind: "page", page: 2 },
    });

    expect([first.items.length, first.hasMore]).toEqual([2, true]);
    expect([second.items.length, second.hasMore]).toEqual([1, false]);
  });

  it("stops counting at the limit", async () => {
    for (let index = 0; index < 5; index++) {
      await repository.create(buildNote({ title: `Match ${index}` }));
    }
    await repository.create(buildNote({ title: "Other" }));

    expect(await repository.countMany(userId, {}, 3)).toBe(3);
    expect(await repository.countMany(userId, {}, 100)).toBe(6);
    expect(await repository.countMany(userId, { title: "match" }, 100)).toBe(5);
  });

  describe("cursor pages", () => {
    // Follows cursors from the first page to the last, like a client would.
    const readAllByCursor = async (sort: NotesSort, pageSize: number) => {
      const ids: string[] = [];
      let options: NotesQueryOptions = { ...defaultOptions, ...sort, pageSize };

      for (;;) {
        const { items, hasMore } = await repository.findMany(userId, options);
        ids.push(...items.map((note) => note.id));

        const last = items.at(-1);

        if (!hasMore || !last) {
          return ids;
        }

        const value =
          sort.sortBy === "title"
            ? last.title
            : last[sort.sortBy].toISOString();
        options = {
          ...options,
          position: { kind: "after", value, id: last.id },
        };
      }
    };

    const sorts: NotesSort[] = [
      { sortBy: "createdAt", sortOrder: "desc" },
      { sortBy: "createdAt", sortOrder: "asc" },
      { sortBy: "updatedAt", sortOrder: "desc" },
      { sortBy: "title", sortOrder: "asc" },
      { sortBy: "title", sortOrder: "desc" },
    ];

    it.each(sorts)(
      "returns every note once, in order, sorted by $sortBy $sortOrder",
      async (sort) => {
        const base = Date.parse("2026-01-01T00:00:00.000Z");

        // Pairs of notes share a timestamp and a title, so the id tiebreaker
        // decides their order, including across page boundaries.
        for (let index = 0; index < 9; index++) {
          const at = new Date(base + Math.floor(index / 2) * 1_000);

          await repository.create(
            buildNote({
              title: `Note ${Math.floor(index / 2)}`,
              createdAt: at,
              updatedAt: at,
            }),
          );
        }

        const all = await repository.findMany(userId, {
          ...defaultOptions,
          ...sort,
          pageSize: 100,
        });

        expect(await readAllByCursor(sort, 2)).toEqual(
          all.items.map((note) => note.id),
        );
        expect(all.items).toHaveLength(9);
      },
    );

    it("applies the search filter to cursor pages", async () => {
      for (let index = 0; index < 5; index++) {
        await repository.create(buildNote({ title: `Budget ${index}` }));
        await repository.create(buildNote({ title: `Travel ${index}` }));
      }

      const first = await repository.findMany(userId, {
        ...defaultOptions,
        search: "budget",
        pageSize: 3,
      });
      const last = first.items.at(-1)!;
      const second = await repository.findMany(userId, {
        ...defaultOptions,
        search: "budget",
        pageSize: 3,
        position: {
          kind: "after",
          value: last.createdAt.toISOString(),
          id: last.id,
        },
      });

      const titles = [...first.items, ...second.items].map(
        (note) => note.title,
      );

      expect(titles).toHaveLength(5);
      expect(titles.every((title) => title.startsWith("Budget"))).toBe(true);
      expect(second.hasMore).toBe(false);
    });
  });

  it("does not repeat notes across pages when sort values are equal", async () => {
    const now = new Date();

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        repository.create(
          buildNote({ title: `Note ${index}`, createdAt: now, updatedAt: now }),
        ),
      ),
    );

    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        repository.findMany(userId, {
          ...defaultOptions,
          pageSize: 2,
          position: { kind: "page", page },
        }),
      ),
    );

    const ids = pages.flatMap((page) => page.items.map((note) => note.id));

    expect(new Set(ids).size).toBe(6);
  });

  it("treats LIKE wildcards in search as literal text", async () => {
    await repository.create(buildNote({ title: "100% done" }));
    await repository.create(buildNote({ title: "100 items" }));

    const result = await repository.findMany(userId, {
      ...defaultOptions,
      search: "100%",
    });

    expect(result.items.map((note) => note.title)).toEqual(["100% done"]);
  });

  it("keeps both changes when partial updates run concurrently", async () => {
    const note = await repository.create(
      buildNote({ title: "Original title", content: "Original content" }),
    );

    await Promise.all([
      repository.update({
        id: note.id,
        userId,
        title: "New title",
        content: undefined,
        updatedAt: new Date(),
      }),
      repository.update({
        id: note.id,
        userId,
        title: undefined,
        content: "New content",
        updatedAt: new Date(),
      }),
    ]);

    const result = await repository.findById(userId, note.id);

    expect(result?.title).toBe("New title");
    expect(result?.content).toBe("New content");
  });

  it("finds a note by id", async () => {
    const note = await repository.create(buildNote({ title: "Find me" }));

    const result = await repository.findById(userId, note.id);

    expect(result?.id).toBe(note.id);
    expect(result?.title).toBe("Find me");
  });

  it("returns null when note does not exist", async () => {
    const result = await repository.findById(userId, randomUUID());

    expect(result).toBeNull();
  });

  it("only reads and changes the given user's notes", async () => {
    const otherUserId = await createUser();
    const note = await repository.create(buildNote());

    expect(await repository.findById(otherUserId, note.id)).toBeNull();
    expect(
      (await repository.findMany(otherUserId, defaultOptions)).items,
    ).toEqual([]);
    expect(await repository.countMany(otherUserId, {}, 100)).toBe(0);
    expect(
      await repository.update({
        id: note.id,
        userId: otherUserId,
        title: "Hijacked",
        content: undefined,
        updatedAt: new Date(),
      }),
    ).toBeNull();
    expect(await repository.deleteById(otherUserId, note.id)).toBe(false);

    expect((await repository.findById(userId, note.id))?.title).toBe("Title");
  });
});
