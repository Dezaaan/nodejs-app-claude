import { createNotesService } from "../../features/notes/notes.service.js";
import type { NotesRepository } from "../../features/notes/notes.repository.js";
import { createTestLogger } from "../helpers/createTestLogger.js";
import { describe, expect, it, vi } from "vitest";

const createTestRepository = (): NotesRepository => ({
  create: vi.fn(),
  deleteById: vi.fn(),
  findMany: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
});

describe("NotesService", () => {
  it("returns paginated notes", async () => {
    const repository = createTestRepository();
    const logger = createTestLogger();

    const notes = [
      {
        id: "1",
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

    const service = createNotesService({
      notesRepository: repository,
      logger,
    });

    const options = {
      page: 1,
      pageSize: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    } as const;

    const result = await service.getNotes(options);

    expect(result).toEqual({
      items: notes,
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
      },
    });
    expect(repository.findMany).toHaveBeenCalledExactlyOnceWith(options);
  });
  it("updates only the provided fields, without reading first", async () => {
    const repository = createTestRepository();
    const logger = createTestLogger();
    const now = new Date();

    vi.mocked(repository.update).mockResolvedValue({
      id: "1",
      title: "New title",
      content: "Existing content",
      createdAt: now,
      updatedAt: now,
    });

    const service = createNotesService({
      notesRepository: repository,
      logger,
    });

    await service.updateNote("1", { title: "New title" });

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledExactlyOnceWith({
      id: "1",
      title: "New title",
      content: undefined,
      updatedAt: expect.any(Date),
    });
  });
  it("throws NotFoundError when updating a missing note", async () => {
    const repository = createTestRepository();
    const logger = createTestLogger();

    vi.mocked(repository.update).mockResolvedValue(null);

    const service = createNotesService({
      notesRepository: repository,
      logger,
    });

    await expect(
      service.updateNote("missing-id", { title: "New title" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });
  it("throws NotFoundError when note does not exist", async () => {
    const repository = createTestRepository();
    const logger = createTestLogger();

    vi.mocked(repository.findById).mockResolvedValue(null);

    const service = createNotesService({
      notesRepository: repository,
      logger,
    });

    await expect(service.getNoteById("missing-id")).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });
  it("creates a note", async () => {
    const repository = createTestRepository();
    const logger = createTestLogger();

    vi.mocked(repository.create).mockImplementation(async (note) => note);

    const service = createNotesService({
      notesRepository: repository,
      logger,
    });

    const result = await service.createNote({
      title: "New note",
      content: "New content",
    });

    expect(result.title).toBe("New note");
    expect(result.content).toBe("New content");

    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);

    expect(repository.create).toHaveBeenCalledOnce();

    expect(logger.info).toHaveBeenCalledWith("Note created", {
      noteId: result.id,
    });
  });
});
