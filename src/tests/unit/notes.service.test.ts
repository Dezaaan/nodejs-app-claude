import { decodeNotesCursor } from "../../features/notes/notes.cursor.js";
import {
  createNotesService,
  MAX_COUNTED_NOTES,
} from "../../features/notes/notes.service.js";
import type { NotesRepository } from "../../features/notes/notes.repository.js";
import type { NotesQueryOptions } from "../../features/notes/notes.types.js";
import { createTestLogger } from "../helpers/createTestLogger.js";
import { describe, expect, it, vi } from "vitest";

const USER_ID = "user-1";
const NOTE_ID = "3f2b8c1e-6d4a-4e9b-9a7c-2d1e0f5b6a71";

const createTestRepository = (): NotesRepository => ({
  countMany: vi.fn(),
  create: vi.fn(),
  deleteById: vi.fn(),
  findMany: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
});

const createService = () => {
  const repository = createTestRepository();
  const logger = createTestLogger();
  const service = createNotesService({ notesRepository: repository, logger });

  return { logger, repository, service };
};

describe("NotesService", () => {
  it("returns paginated notes", async () => {
    const { repository, service } = createService();

    const notes = [
      {
        id: NOTE_ID,
        userId: USER_ID,
        title: "First note",
        content: "Content",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(repository.findMany).mockResolvedValue({
      items: notes,
      hasMore: true,
    });
    vi.mocked(repository.countMany).mockResolvedValue(21);

    const options: NotesQueryOptions = {
      pageSize: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
      search: "first",
      position: { kind: "page", page: 1 },
    };

    const result = await service.getNotes(USER_ID, options);

    expect(result).toEqual({
      items: notes,
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
        totalItemsCapped: false,
        nextCursor: expect.any(String),
      },
    });
    expect(repository.findMany).toHaveBeenCalledExactlyOnceWith(
      USER_ID,
      options,
    );
    expect(repository.countMany).toHaveBeenCalledExactlyOnceWith(
      USER_ID,
      { search: "first" },
      MAX_COUNTED_NOTES + 1,
    );

    // The cursor continues right after the page's last note, with the same
    // sort and search.
    const { nextCursor } = result.pagination;
    expect(decodeNotesCursor(nextCursor!)).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
      search: "first",
      value: notes[0]!.createdAt.toISOString(),
      id: NOTE_ID,
    });
  });

  it("caps the total when there are more notes than it counts", async () => {
    const { repository, service } = createService();

    vi.mocked(repository.findMany).mockResolvedValue({
      items: [],
      hasMore: false,
    });
    vi.mocked(repository.countMany).mockResolvedValue(MAX_COUNTED_NOTES + 1);

    const result = await service.getNotes(USER_ID, {
      pageSize: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
      position: { kind: "page", page: 1 },
    });

    expect(result.pagination).toMatchObject({
      totalItems: MAX_COUNTED_NOTES,
      totalPages: MAX_COUNTED_NOTES / 20,
      totalItemsCapped: true,
      nextCursor: null,
    });
  });

  it("doesn't count for cursor pages", async () => {
    const { repository, service } = createService();

    vi.mocked(repository.findMany).mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const result = await service.getNotes(USER_ID, {
      pageSize: 20,
      sortBy: "title",
      sortOrder: "asc",
      position: {
        kind: "after",
        value: "Some title",
        id: "00000000-0000-4000-8000-000000000000",
      },
    });

    expect(result.pagination).toEqual({ pageSize: 20, nextCursor: null });
    expect(repository.countMany).not.toHaveBeenCalled();
  });

  it("updates only the provided fields, without reading first", async () => {
    const { repository, service } = createService();
    const now = new Date();

    vi.mocked(repository.update).mockResolvedValue({
      id: "1",
      userId: USER_ID,
      title: "New title",
      content: "Existing content",
      createdAt: now,
      updatedAt: now,
    });

    await service.updateNote(USER_ID, "1", { title: "New title" });

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledExactlyOnceWith({
      id: "1",
      userId: USER_ID,
      title: "New title",
      content: undefined,
      updatedAt: expect.any(Date),
    });
  });

  it("throws NotFoundError when updating a missing note", async () => {
    const { repository, service } = createService();

    vi.mocked(repository.update).mockResolvedValue(null);

    await expect(
      service.updateNote(USER_ID, "missing-id", { title: "New title" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("throws NotFoundError when note does not exist", async () => {
    const { repository, service } = createService();

    vi.mocked(repository.findById).mockResolvedValue(null);

    await expect(
      service.getNoteById(USER_ID, "missing-id"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("creates a note owned by the user", async () => {
    const { logger, repository, service } = createService();

    vi.mocked(repository.create).mockImplementation(async (note) => note);

    const result = await service.createNote(USER_ID, {
      title: "New note",
      content: "New content",
    });

    expect(result).toEqual({
      id: expect.any(String),
      userId: USER_ID,
      title: "New note",
      content: "New content",
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });

    expect(repository.create).toHaveBeenCalledOnce();

    expect(logger.info).toHaveBeenCalledWith("Note created", {
      noteId: result.id,
    });
  });
});
