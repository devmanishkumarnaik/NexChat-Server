import mongoose, { Schema, model } from "mongoose";
import {hash} from "bcrypt";

const schema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    // bio: {
    //   type: String,
    //   required: true,
    // },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    avatar: {
      public_id: {
        type: String,
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

schema.pre("save", async function(next){
  if(!this.isModified("password")) return next();
  this.password = await hash(this.password, 10);
})

export const User = mongoose.models.User || model("User", schema);
