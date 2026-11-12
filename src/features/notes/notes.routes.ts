import { Router } from "express";
import { requirePermission } from "../../shared/http/requirePermission.js";
import type { NotesController } from "./notes.controller.js";

type CreateNotesRoutesDependencies = {
  notesController: NotesController;
};

// Mounted behind requireAuth, which sets the user these checks read.
export const createNotesRoutes = ({
  notesController,
}: CreateNotesRoutesDependencies): Router => {
  const router = Router();

  const canView = requirePermission("notes.view");
  const canEdit = requirePermission("notes.edit");

  router.get("/", canView, notesController.getNotes);
  router.get("/:id", canView, notesController.getNoteById);
  router.post("/", canEdit, notesController.createNote);
  router.patch("/:id", canEdit, notesController.updateNote);
  router.delete("/:id", canEdit, notesController.deleteNote);

  return router;
};
