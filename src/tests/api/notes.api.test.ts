import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import {
  registerTestUser,
  setTestUserRole,
  type TestUser,
} from "../helpers/authHelpers.js";
import { createTestContainer } from "../helpers/createTestContainer.js";
import { resetDatabase } from "../helpers/resetDatabase.js";

const container = createTestContainer();
const app = createApp(container);

describe("Notes API", () => {
  let user: TestUser;

  // Small helpers so each test reads as plain HTTP calls made by `user`.
  const get = (url: string, as = user) =>
    request(app).get(url).auth(as.accessToken, { type: "bearer" });
  const post = (url: string, as = user) =>
    request(app).post(url).auth(as.accessToken, { type: "bearer" });
  const patch = (url: string, as = user) =>
    request(app).patch(url).auth(as.accessToken, { type: "bearer" });
  const del = (url: string, as = user) =>
    request(app).delete(url).auth(as.accessToken, { type: "bearer" });

  beforeEach(async () => {
    await resetDatabase(container.infrastructure.database);

    user = await registerTestUser(app);
  });

  afterAll(async () => {
    await container.infrastructure.database.close();
  });

  it("requires an access token", async () => {
    const response = await request(app).get("/api/v1/notes");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("creates a note", async () => {
    const response = await post("/api/v1/notes").send({
      title: "API note",
      content: "Created through HTTP",
    });

    expect(response.status).toBe(201);

    expect(response.body).toEqual({
      id: expect.any(String),
      title: "API note",
      content: "Created through HTTP",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("returns all notes", async () => {
    await post("/api/v1/notes").send({
      title: "First note",
      content: "First content",
    });

    await post("/api/v1/notes").send({
      title: "Second note",
      content: "Second content",
    });

    const response = await get("/api/v1/notes");

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 2,
      totalPages: 1,
      totalItemsCapped: false,
      nextCursor: null,
    });
  });

  describe("cursor pagination", () => {
    beforeEach(async () => {
      for (let index = 0; index < 5; index++) {
        await post("/api/v1/notes").send({
          title: `Note ${index}`,
          content: index % 2 === 0 ? "budget" : "travel",
        });
      }
    });

    it("pages through every note by following nextCursor", async () => {
      const first = await get(
        "/api/v1/notes?pageSize=2&sortBy=title&sortOrder=asc",
      );
      const titlesOf = (body: { items: { title: string }[] }) =>
        body.items.map((note) => note.title);

      const titles = titlesOf(first.body);
      let cursor: string | null = first.body.pagination.nextCursor;

      while (cursor) {
        // The cursor alone carries the sort.
        const page = await get(
          `/api/v1/notes?pageSize=2&cursor=${encodeURIComponent(cursor)}`,
        );

        expect(page.status).toBe(200);
        expect(Object.keys(page.body.pagination).sort()).toEqual([
          "nextCursor",
          "pageSize",
        ]);

        titles.push(...titlesOf(page.body));
        cursor = page.body.pagination.nextCursor;
      }

      expect(titles).toEqual([
        "Note 0",
        "Note 1",
        "Note 2",
        "Note 3",
        "Note 4",
      ]);
    });

    it("keeps the search for cursor pages", async () => {
      const first = await get("/api/v1/notes?pageSize=2&search=budget");
      const second = await get(
        `/api/v1/notes?pageSize=2&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`,
      );

      expect(first.body.pagination.totalItems).toBe(3);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.items[0].content).toBe("budget");
      expect(second.body.pagination.nextCursor).toBeNull();
    });

    it("accepts the same query repeated with the cursor", async () => {
      const first = await get("/api/v1/notes?pageSize=2&search=budget");
      const response = await get(
        `/api/v1/notes?pageSize=2&search=budget&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`,
      );

      expect(response.status).toBe(200);
    });

    it("rejects a cursor combined with a different search or sort", async () => {
      const first = await get("/api/v1/notes?pageSize=2&search=budget");
      const cursor = encodeURIComponent(first.body.pagination.nextCursor);

      for (const query of ["search=travel", "sortBy=title"]) {
        const response = await get(`/api/v1/notes?${query}&cursor=${cursor}`);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("CURSOR_MISMATCH");
      }
    });

    it("rejects a cursor together with a page number", async () => {
      const first = await get("/api/v1/notes?pageSize=2");
      const response = await get(
        `/api/v1/notes?page=2&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it.each([
      ["not base64 JSON", "not-a-cursor"],
      [
        "an invalid timestamp",
        Buffer.from(
          JSON.stringify({
            sortBy: "createdAt",
            sortOrder: "desc",
            value: "yesterday",
            id: "00000000-0000-4000-8000-000000000000",
          }),
        ).toString("base64url"),
      ],
    ])("rejects a cursor that is %s", async (_label, cursor) => {
      const response = await get(`/api/v1/notes?cursor=${cursor}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_CURSOR");
    });

    it("only shows the caller's notes, even with someone else's cursor", async () => {
      const first = await get("/api/v1/notes?pageSize=2");
      const otherUser = await registerTestUser(app);

      const response = await get(
        `/api/v1/notes?cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`,
        otherUser,
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
    });
  });

  it("returns a note by id", async () => {
    const createResponse = await post("/api/v1/notes").send({
      title: "Specific note",
      content: "Specific content",
    });

    const id = createResponse.body.id;

    const response = await get(`/api/v1/notes/${id}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      id,
      title: "Specific note",
      content: "Specific content",
    });
  });

  it("returns 400 for invalid note input", async () => {
    const response = await post("/api/v1/notes").send({
      title: "",
      content: "",
    });

    expect(response.status).toBe(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await post("/api/v1/notes")
      .set("content-type", "application/json")
      .send("{bad");

    expect(response.status).toBe(400);

    expect(response.body.error.code).toBe("BAD_REQUEST");
  });

  it("returns 400 for an invalid note id", async () => {
    const response = await get("/api/v1/notes/not-a-uuid");

    expect(response.status).toBe(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when note does not exist", async () => {
    const response = await get(`/api/v1/notes/${randomUUID()}`);

    expect(response.status).toBe(404);

    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Note not found",
      },
    });
  });

  it("returns 404 for unknown route", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("updates a note", async () => {
    const created = await post("/api/v1/notes").send({
      title: "Original title",
      content: "Original content",
    });

    const response = await patch(`/api/v1/notes/${created.body.id}`).send({
      title: "Updated title",
    });

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      id: created.body.id,
      title: "Updated title",
      content: "Original content",
    });
  });

  it("deletes a note", async () => {
    const created = await post("/api/v1/notes").send({
      title: "Delete me",
      content: "Content",
    });

    const response = await del(`/api/v1/notes/${created.body.id}`);

    expect(response.status).toBe(204);

    const getResponse = await get(`/api/v1/notes/${created.body.id}`);

    expect(getResponse.status).toBe(404);
  });

  describe("ownership", () => {
    let otherUser: TestUser;
    let noteId: string;

    beforeEach(async () => {
      otherUser = await registerTestUser(app);

      const created = await post("/api/v1/notes").send({
        title: "Private note",
        content: "Only mine",
      });

      noteId = created.body.id;
    });

    it("hides other users' notes from the list", async () => {
      const response = await get("/api/v1/notes", otherUser);

      expect(response.body.items).toEqual([]);
      expect(response.body.pagination.totalItems).toBe(0);
    });

    it("returns 404 for another user's note", async () => {
      const response = await get(`/api/v1/notes/${noteId}`, otherUser);

      expect(response.status).toBe(404);
    });

    it("does not let another user update or delete a note", async () => {
      const update = await patch(`/api/v1/notes/${noteId}`, otherUser).send({
        title: "Hijacked",
      });
      const deletion = await del(`/api/v1/notes/${noteId}`, otherUser);

      expect(update.status).toBe(404);
      expect(deletion.status).toBe(404);

      const original = await get(`/api/v1/notes/${noteId}`);

      expect(original.body.title).toBe("Private note");
    });
  });

  describe("read-only users", () => {
    let viewer: TestUser;
    let noteId: string;

    beforeEach(async () => {
      const created = await post("/api/v1/notes").send({
        title: "Written before",
        content: "Now read-only",
      });

      noteId = created.body.id;

      viewer = await setTestUserRole(
        app,
        container.features.auth.service,
        user,
        "viewer",
      );
    });

    it("can list and read their notes", async () => {
      const list = await get("/api/v1/notes", viewer);
      const one = await get(`/api/v1/notes/${noteId}`, viewer);

      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(one.status).toBe(200);
    });

    it("cannot create, update or delete notes", async () => {
      const creation = await post("/api/v1/notes", viewer).send({
        title: "New",
        content: "Content",
      });
      const update = await patch(`/api/v1/notes/${noteId}`, viewer).send({
        title: "Changed",
      });
      const deletion = await del(`/api/v1/notes/${noteId}`, viewer);

      for (const response of [creation, update, deletion]) {
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("FORBIDDEN");
      }

      const list = await get("/api/v1/notes", viewer);

      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].title).toBe("Written before");
    });
  });
});
