import express from "express";
import {
  addMembers,
  deleteChat,
  getChatDetails,
  getMessages,
  getMyChats,
  getMyGroups,
  leaveGroup,
  newGroupChat,
  removeMember,
  renameGroup,
  sendAttachments,
  sendLocation,
  sendPoll,
  votePoll,
  deleteMessage,
  editMessage,
} from "../controllers/chat.js";
import {
  addMemberValidator,
  chatIdValidator,
  newGroupValidator,
  removeMemberValidator,
  renameValidator,
  sendAttachmentsValidator,
  validateHandler,
} from "../lib/validators.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { attachmentsMulter } from "../middlewares/multer.js";

const app = express.Router();

//After here user must be logged in to access the routes
app.use(isAuthenticated);

app.post("/new", newGroupValidator(), validateHandler, newGroupChat);
app.get("/my", getMyChats);
app.get("/my/groups", getMyGroups);
app.put("/addmembers", addMemberValidator(), validateHandler, addMembers);
app.put(
  "/removemember",
  removeMemberValidator(),
  validateHandler,
  removeMember
);

app.put("/leave/:id", chatIdValidator(), validateHandler, leaveGroup);

//Send Attachments
app.post(
  "/message",
  attachmentsMulter,
  sendAttachmentsValidator(),
  validateHandler,
  sendAttachments
);

//Send Location
app.post("/send-location", sendLocation);

//Send Poll
app.post("/send-poll", sendPoll);

//Vote on Poll
app.put("/vote-poll", votePoll);

//Get Messages
app.get("/message/:id", chatIdValidator(), validateHandler, getMessages);

//Delete Message
app.delete("/message/:id", deleteMessage);

//Edit Message
app.put("/message/:id", editMessage);

//Get Chat Details, rename, delete
app
  .route("/:id")
  .get(chatIdValidator(), validateHandler, getChatDetails)
  .put(renameValidator(), validateHandler,renameGroup)
  .delete(chatIdValidator(), validateHandler,deleteChat);

export default app;
