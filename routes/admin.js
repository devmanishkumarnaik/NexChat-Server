import express from "express";
import { adminLogin, adminLogout, allChats, allMessages, allUsers, deleteMessage, deleteUser, getAdminData, getDashboardStats, getUserWithPassword, searchAdmin, updateUser } from "../controllers/admin.js";
import {adminLoginValidator, validateHandler} from "../lib/validators.js";
import { adminOnly } from "../middlewares/auth.js";

const app = express.Router();

app.post("/verify", adminLoginValidator(), validateHandler, adminLogin);
app.get("/logout", adminLogout);

app.use(adminOnly);

app.get("/", getAdminData);

app.get("/users", allUsers);
app.get("/users/:id", getUserWithPassword);
app.put("/users/:id", updateUser);
app.delete("/users/:id", deleteUser);
app.get("/chats", allChats);
app.get("/messages", allMessages);
app.delete("/messages/:id", deleteMessage);
app.get("/stats", getDashboardStats);
app.get("/search", searchAdmin);

export default app;
