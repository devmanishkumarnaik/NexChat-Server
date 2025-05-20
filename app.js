import express from "express";
import { connectDB } from "./utils/features.js";
import dotenv from "dotenv";
import { errorMiddleware } from "./middlewares/error.js";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import {createServer} from 'http';
import {v4 as uuid} from "uuid";
import cors from "cors";
import {v2 as cloudinary} from "cloudinary";
import { CHAT_JOINED, CHAT_LEAVED, NEW_MESSAGE, NEW_MESSAGE_ALERT, ONLINE_USERS, START_TYPING, STOP_TYPING, MESSAGE_DELETED } from "./constants/events.js";
import { getSockets } from "./lib/helper.js";
import { Message } from "./models/message.js";
import { corsOptions } from "./constants/config.js";
import { socketAuthenticator } from "./middlewares/auth.js";

import userRoute from "./routes/user.js";
import chatRoute from "./routes/chat.js";
import adminRoute from "./routes/admin.js";
import noteRoute from "./routes/note.js";

dotenv.config({
  path: "./.env",
});
const mongoURI = process.env.MONGO_URI;
const port = process.env.PORT || 3000;
const envMode = process.env.NODE_ENV.trim() || "PRODUCTION";

const adminSecretKey = process.env.ADMIN_SECRET_KEY || "manishinc9291";

const userSocketIDs = new Map();
const onlineUsers = new Set();

connectDB(mongoURI);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const app = express();
const server = createServer(app);
const io = new Server(server, {cors: corsOptions})

app.set("io", io);

//using Middlewares Here
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));

app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);
app.use("/api/v1/note", noteRoute);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

io.use((socket, next)=>{
  cookieParser()(
    socket.request,
    socket.request.res,
    async (err) => await socketAuthenticator(err, socket, next)
  );
});

// Handle errors at the socket.io server level
io.engine.on("connection_error", (err) => {
  console.error("Connection Error:", err);
});

io.on("connection", (socket)=>{
  console.log(`Socket connected: ${socket.id}`);

  try {
    const user = socket.user;
    
    if (!user || !user._id) {
      console.error("Socket connection without valid user");
      return socket.disconnect();
    }
    
    userSocketIDs.set(user._id.toString(), socket.id);
    
    // Inform the client that connection was successful
    socket.emit('connection_success', { userId: user._id });

    socket.on(NEW_MESSAGE, async({chatId, members, message})=>{
      try {
        const messageForRealTime = {
          content: message,
          _id: uuid(),
          sender: {
            _id: user._id,
            name: user.name
          },
          chat: chatId,
          createdAt: new Date().toISOString(),
        };

        const messageForDB = {
          content: message,
          sender: user._id,
          chat: chatId
        }

        const membersSocket = getSockets(members);
        io.to(membersSocket).emit(NEW_MESSAGE, {
          chatId,
          message: messageForRealTime
        });
        io.to(membersSocket).emit(NEW_MESSAGE_ALERT, {chatId})

        try {
          await Message.create(messageForDB);
        } catch (error) {
          console.error("Error saving message to database:", error);
          socket.emit('error', { message: 'Failed to save message', error: error.message });
        }
      } catch (error) {
        console.error("Error handling NEW_MESSAGE event:", error);
        socket.emit('error', { message: 'Failed to process message', error: error.message });
      }
    })

  socket.on(START_TYPING, ({ members, chatId }) => {
    try {
      const membersSockets = getSockets(members);
      socket.to(membersSockets).emit(START_TYPING, { chatId });
    } catch (error) {
      console.error("Error in START_TYPING event:", error);
      socket.emit('error', { message: 'Failed to process typing event', error: error.message });
    }
  });

  socket.on(STOP_TYPING, ({ members, chatId }) => {
    try {
      const membersSockets = getSockets(members);
      socket.to(membersSockets).emit(STOP_TYPING, { chatId });
    } catch (error) {
      console.error("Error in STOP_TYPING event:", error);
      socket.emit('error', { message: 'Failed to process typing event', error: error.message });
    }
  });

  socket.on(CHAT_JOINED, ({ userId, members }) => {
    try {
      onlineUsers.add(userId.toString());
      
      const membersSocket = getSockets(members);
      io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
    } catch (error) {
      console.error("Error in CHAT_JOINED event:", error);
      socket.emit('error', { message: 'Failed to process chat join', error: error.message });
    }
  });

  socket.on(CHAT_LEAVED, ({ userId, members }) => {
    try {
      onlineUsers.delete(userId.toString());
      
      const membersSocket = getSockets(members);
      io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
    } catch (error) {
      console.error("Error in CHAT_LEAVED event:", error);
      socket.emit('error', { message: 'Failed to process chat leave', error: error.message });
    }
  });

  socket.on("disconnect", ()=>{
    try {
      console.log(`Socket disconnected: ${socket.id}`);
      userSocketIDs.delete(user._id.toString());
      onlineUsers.delete(user._id.toString());
      socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
    } catch (error) {
      console.error("Error in disconnect handler:", error);
    }
  })
  
  // Handle socket errors
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
  
  } catch (error) {
    console.error("Error in socket connection handler:", error);
    socket.disconnect();
  }
})

app.use(errorMiddleware);

server.listen(port, () => {
  console.log(
    `Server is running on port ${port} in ${envMode} Mode`
  );
});

export { envMode, adminSecretKey, userSocketIDs };
