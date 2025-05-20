//import { Schema, Types, model, models } from "mongoose";
import mongoose, { Schema, Types, model } from "mongoose";

const schema = new Schema(
  {
    content: String,

    attachments: [
      {
        public_id: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
      },
    ],
    
    location: {
      latitude: Number,
      longitude: Number,
      url: String,
      timestamp: Date
    },
    
    poll: {
      question: String,
      options: [{
        text: String,
        votes: [{
          type: Types.ObjectId,
          ref: "User"
        }]
      }],
      multipleAnswers: {
        type: Boolean,
        default: false
      },
      endTime: Date
    },
    
    sender: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    chat: {
      type: Types.ObjectId,
      ref: "Chat",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Message = mongoose.models.Message || model("Message", schema);
