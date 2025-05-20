import mongoose, { Schema, Types, model } from "mongoose";

const schema = new Schema(
  {
    content: {
      type: String,
      required: true,
    },
    user: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      default: "Untitled Note",
    },
  },
  {
    timestamps: true,
  }
);

export const Note = mongoose.models.Note || model("Note", schema); 