import { createNotesService } from "../../features/notes/notes.service.js";
import type { NotesRepository } from "../../features/notes/notes.repository.js";
import { createTestLogger } from "../helpers/createTestLogger.js";
import { describe, expect, it, vi } from "vitest";

const USER_ID = "user-1";

const createTestRepository = (): NotesRepository => ({
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
        id: "1",
        userId: USER_ID,
        title: "First note",
        content: "Content",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(repository.findMany).mockResolvedValue({
      items: notes,
      totalItems: 21,
    });

    const options = {
      page: 1,
      pageSize: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    } as const;

    const result = await service.getNotes(USER_ID, options);

    expect(result).toEqual({
      items: notes,
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
      },
    });
    expect(repository.findMany).toHaveBeenCalledExactlyOnceWith(
      USER_ID,
      options,
    );
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
