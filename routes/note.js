import express from "express";
import { createNote, deleteNote, getNote, getNotes, updateNote } from "../controllers/note.js";
import { isAuthenticated } from "../middlewares/auth.js";

const app = express.Router();

// Apply authentication middleware to all routes
app.use(isAuthenticated);

// Routes
app.post("/new", createNote);
app.get("/all", getNotes);
app.route("/:id")
  .get(getNote)
  .put(updateNote)
  .delete(deleteNote);

export default app; 