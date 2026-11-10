import { Router } from "express";
import type { NotesController } from "./notes.controller.js";

type CreateNotesRoutesDependencies = {
  notesController: NotesController;
};

export const createNotesRoutes = ({
  notesController,
}: CreateNotesRoutesDependencies): Router => {
  const router = Router();

  router.get("/", notesController.getNotes);
  router.get("/:id", notesController.getNoteById);
  router.post("/", notesController.createNote);
  router.patch("/:id", notesController.updateNote);
  router.delete("/:id", notesController.deleteNote);

  return router;
};
