import { Note } from "../models/note.js";
import { TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";

// Create a new note
const createNote = TryCatch(async (req, res, next) => {
  const { title, content } = req.body;
  
  if (!content) return next(new ErrorHandler("Content is required", 400));
  
  const note = await Note.create({
    title: title || "Untitled Note",
    content,
    user: req.user
  });
  
  return res.status(201).json({
    success: true,
    message: "Note created successfully",
    note
  });
});

// Get all notes for the current user
const getNotes = TryCatch(async (req, res, next) => {
  const notes = await Note.find({ user: req.user }).sort({ updatedAt: -1 });
  
  return res.status(200).json({
    success: true,
    notes
  });
});

// Get a specific note
const getNote = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  
  const note = await Note.findById(id);
  
  if (!note) return next(new ErrorHandler("Note not found", 404));
  
  // Check if the note belongs to the current user
  if (note.user.toString() !== req.user.toString()) 
    return next(new ErrorHandler("Unauthorized", 403));
  
  return res.status(200).json({
    success: true,
    note
  });
});

// Update a note
const updateNote = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const { title, content } = req.body;
  
  const note = await Note.findById(id);
  
  if (!note) return next(new ErrorHandler("Note not found", 404));
  
  // Check if the note belongs to the current user
  if (note.user.toString() !== req.user.toString()) 
    return next(new ErrorHandler("Unauthorized", 403));
  
  if (title) note.title = title;
  if (content) note.content = content;
  
  await note.save();
  
  return res.status(200).json({
    success: true,
    message: "Note updated successfully",
    note
  });
});

// Delete a note
const deleteNote = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  
  const note = await Note.findById(id);
  
  if (!note) return next(new ErrorHandler("Note not found", 404));
  
  // Check if the note belongs to the current user
  if (note.user.toString() !== req.user.toString()) 
    return next(new ErrorHandler("Unauthorized", 403));
  
  await note.deleteOne();
  
  return res.status(200).json({
    success: true,
    message: "Note deleted successfully"
  });
});

export {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote
}; 