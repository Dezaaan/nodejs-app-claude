import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresNotesRepository } from "../../features/notes/notes.repository.postgres.js";
import type { Note } from "../../features/notes/notes.types.js";
import { createTestDatabase } from "../helpers/createTestDatabase.js";

const database = createTestDatabase();

const repository = createPostgresNotesRepository({
  database,
});

const defaultOptions = {
  page: 1,
  pageSize: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
} as const;

describe("PostgresNotesRepository", () => {
  beforeEach(async () => {
    await database.query("DELETE FROM notes");
  });

  afterAll(async () => {
    await database.close();
  });

  it("creates a note", async () => {
    const now = new Date();

    const note: Note = {
      id: randomUUID(),
      title: "Integration test",
      content: "PostgreSQL content",
      createdAt: now,
      updatedAt: now,
    };

    const result = await repository.create(note);

    expect(result.id).toBe(note.id);
    expect(result.title).toBe(note.title);
    expect(result.content).toBe(note.content);
  });

  it("finds all notes", async () => {
    const now = new Date();

    await repository.create({
      id: randomUUID(),
      title: "Note one",
      content: "Content one",
      createdAt: now,
      updatedAt: now,
    });

    await repository.create({
      id: randomUUID(),
      title: "Note two",
      content: "Content two",
      createdAt: now,
      updatedAt: now,
    });

    const result = await repository.findMany(defaultOptions);

    expect(result.items).toHaveLength(2);
    expect(result.totalItems).toBe(2);
  });

  it("does not repeat notes across pages when sort values are equal", async () => {
    const now = new Date();

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        repository.create({
          id: randomUUID(),
          title: `Note ${index}`,
          content: "Content",
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );

    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        repository.findMany({ ...defaultOptions, page, pageSize: 2 }),
      ),
    );

    const ids = pages.flatMap((page) => page.items.map((note) => note.id));

    expect(new Set(ids).size).toBe(6);
  });

  it("treats LIKE wildcards in search as literal text", async () => {
    const now = new Date();

    await repository.create({
      id: randomUUID(),
      title: "100% done",
      content: "Content",
      createdAt: now,
      updatedAt: now,
    });

    await repository.create({
      id: randomUUID(),
      title: "100 items",
      content: "Content",
      createdAt: now,
      updatedAt: now,
    });

    const result = await repository.findMany({
      ...defaultOptions,
      search: "100%",
    });

    expect(result.items.map((note) => note.title)).toEqual(["100% done"]);
  });

  it("keeps both changes when partial updates run concurrently", async () => {
    const now = new Date();
    const id = randomUUID();

    await repository.create({
      id,
      title: "Original title",
      content: "Original content",
      createdAt: now,
      updatedAt: now,
    });

    await Promise.all([
      repository.update({
        id,
        title: "New title",
        content: undefined,
        updatedAt: now,
      }),
      repository.update({
        id,
        title: undefined,
        content: "New content",
        updatedAt: now,
      }),
    ]);

    const result = await repository.findById(id);

    expect(result?.title).toBe("New title");
    expect(result?.content).toBe("New content");
  });

  it("finds a note by id", async () => {
    const now = new Date();

    const note: Note = {
      id: randomUUID(),
      title: "Find me",
      content: "Content",
      createdAt: now,
      updatedAt: now,
    };

    await repository.create(note);

    const result = await repository.findById(note.id);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(note.id);
    expect(result?.title).toBe("Find me");
  });

  it("returns null when note does not exist", async () => {
    const result = await repository.findById(randomUUID());

    expect(result).toBeNull();
  });
});
