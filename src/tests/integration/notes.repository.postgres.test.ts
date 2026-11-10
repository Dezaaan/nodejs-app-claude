import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresUsersRepository } from "../../features/auth/auth.repository.postgres.js";
import { createPostgresNotesRepository } from "../../features/notes/notes.repository.postgres.js";
import type { Note } from "../../features/notes/notes.types.js";
import { createTestDatabase } from "../helpers/createTestDatabase.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

const database = createTestDatabase();

const repository = createPostgresNotesRepository({
  database,
});

const usersRepository = createPostgresUsersRepository({ database });

const defaultOptions = {
  page: 1,
  pageSize: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
} as const;

const createUser = async (): Promise<string> => {
  const now = new Date();
  const user = await usersRepository.create({
    id: randomUUID(),
    email: `user-${randomUUID()}@example.com`,
    passwordHash: "not-a-real-hash",
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
    expect(result.totalItems).toBe(2);
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
        repository.findMany(userId, { ...defaultOptions, page, pageSize: 2 }),
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
      (await repository.findMany(otherUserId, defaultOptions)).totalItems,
    ).toBe(0);
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
