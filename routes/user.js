import express from "express";
import {
  acceptFriendRequest,
  getMyFriends,
  getMyNotifications,
  getMyProfile,
  login,
  logout,
  newUser,
  searchUser,
  sendFriendRequest,
  updateProfile,
  changePassword,
  deleteAccount,
  forgotPassword,
  resetPassword,
} from "../controllers/user.js";
import { singleAvatar } from "../middlewares/multer.js";
import { isAuthenticated } from "../middlewares/auth.js";
import {
  registerValidator,
  loginValidator,
  sendRequestValidator,
  validateHandler,
  acceptRequestValidator,
} from "../lib/validators.js";

const app = express.Router();

app.post("/new", singleAvatar, registerValidator(), validateHandler, newUser);
app.post("/login", loginValidator(), validateHandler, login);

// Password reset routes (no auth required)
app.post("/forgot-password", forgotPassword);
app.post("/reset-password/:token", resetPassword);

//After here user must be logged in to access the routes
app.use(isAuthenticated);
app.get("/me", getMyProfile);

app.get("/logout", logout);

app.get("/search", searchUser);

app.put(
  "/sendrequest",
  sendRequestValidator(),
  validateHandler,
  sendFriendRequest
);

app.put(
  "/acceptrequest",
  acceptRequestValidator(),
  validateHandler,
  acceptFriendRequest
);

app.get(
  "/notifications",
  getMyNotifications
);

app.get(
  "/friends",
  getMyFriends
);

// Add new profile update routes
app.put(
  "/update-profile",
  singleAvatar,
  updateProfile
);

app.put(
  "/change-password",
  changePassword
);

// Delete account route
app.delete(
  "/delete-account",
  deleteAccount
);

export default app;
