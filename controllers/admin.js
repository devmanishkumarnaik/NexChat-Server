import { TryCatch } from "../middlewares/error.js";
import { User } from "../models/user.js";
import { Chat } from "../models/chat.js";
import { Message } from "../models/message.js";
import jwt from "jsonwebtoken";
import { adminSecretKey } from "../app.js";
import { ErrorHandler } from "../utils/utility.js";
import { cookieOptions } from "../utils/features.js";

const adminLogin = TryCatch(async (req, res, next) => {
  const { secretKey } = req.body;

  //const adminSecretKey = process.env.ADMIN_SECRET_KEY || "manishinc9291";

  const isMatched = secretKey === adminSecretKey;

  if (!isMatched) return next(new ErrorHandler("Invalid Admin Key", 401));

  const token = jwt.sign(secretKey, process.env.JWT_SECRET);

  return res
    .status(200)
    .cookie("ChatApp2.0-admin", token, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 15,
    })
    .json({
      success: true,
      message: "Authenticated Successfully, Welcome BOSS",
    });
});

const allUsers = TryCatch(async (req, res) => {
  const users = await User.find({});

  const transformUsers = await Promise.all(
    users.map(async ({ name, username, avatar, _id }) => {
      const [groups, friends] = await Promise.all([
        Chat.countDocuments({ groupChat: true, members: _id }),
        Chat.countDocuments({ groupChat: false, members: _id }),
      ]);

      return {
        name,
        username,
        avatar: avatar.url,
        _id,
        groups,
        friends,
      };
    })
  );

  return res.status(200).json({
    status: "success",
    users: transformUsers,
  });
});

const allChats = TryCatch(async (req, res) => {
  const chats = await Chat.find({})
    .populate("members", "name avatar")
    .populate("creator", "name avatar");

  const transformedChats = await Promise.all(
    chats.map(async ({ members, _id, groupChat, name, creator }) => {
      const totalMessages = await Message.countDocuments({ chat: _id });
      return {
        _id,
        groupChat,
        name,
        avatar: members.slice(0, 3).map((member) => member.avatar.url),
        members: members.map(({ _id, name, avatar }) => ({
          _id,
          name,
          avatar: avatar.url,
        })),
        creator: {
          name: creator?.name || "None",
          avatar: creator?.avatar.url || "",
        },
        totalMembers: members.length,
        totalMessages,
      };
    })
  );

  return res.status(200).json({
    status: "success",
    chats: transformedChats,
  });
});

const allMessages = TryCatch(async (req, res) => {
  const messages = await Message.find({})
    .populate("sender", "name avatar")
    .populate("chat", "groupChat");

  const transformedMessages = messages.map(
    ({ content, attachments, _id, sender, createdAt, chat }) => ({
      _id,
      attachments,
      content,
      createdAt,
      chat: chat._id,
      groupChat: chat.groupChat,
      sender: {
        _id: sender._id,
        name: sender.name,
        avatar: sender.avatar.url,
      },
    })
  );

  return res.status(200).json({
    success: true,
    messages: transformedMessages,
  });
});

const getDashboardStats = TryCatch(async (req, res) => {
  const [groupsCount, usersCount, messagesCount, totalChatsCount] =
    await Promise.all([
      Chat.countDocuments({ groupChat: true }),
      User.countDocuments(),
      Message.countDocuments(),
      Chat.countDocuments(),
    ]);

  const today = new Date();

  const last7Days = new Date();
  last7Days.setDate(last7Days.getDate() - 7);

  const last7DaysMessages = await Message.find({
    createdAt: {
      $gte: last7Days,
      $lte: today,
    },
  }).select("createdAt");

  const messages = new Array(7).fill(0);
  const dayInMiliSeconds = 1000 * 60 * 60 * 24;

  last7DaysMessages.forEach((message) => {
    const indexApprox =
      (today.getTime() - message.createdAt.getTime()) / dayInMiliSeconds;
    const index = Math.floor(indexApprox);

    messages[6 - index]++;
  });

  const stats = {
    groupsCount,
    usersCount,
    messagesCount,
    totalChatsCount,
    messagesChart: messages,
  };

  return res.status(200).json({
    success: true,
    stats,
  });
});

const adminLogout = TryCatch(async (req, res, next) => {
  return res
    .status(200)
    .cookie("ChatApp2.0-admin", "", {
      ...cookieOptions,
      maxAge: 0,
    })
    .json({
      success: true,
      message: "Logged Out Successfully",
    });
});

const getAdminData = TryCatch(async (req, res, next) => {
  return res.status(200).json({
    admin: true
  })
});

const deleteUser = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  
  // Find the user first to ensure it exists
  const user = await User.findById(id);
  
  if (!user) return next(new ErrorHandler("User not found", 404));
  
  // Find all chats where the user is a member
  const userChats = await Chat.find({ members: id });
  
  // Get chat IDs to delete messages from these chats
  const chatIds = userChats.map(chat => chat._id);
  
  // Delete messages from user's chats
  await Message.deleteMany({ chat: { $in: chatIds } });
  
  // Delete chats where user is the only member or delete user from chats with multiple members
  for (const chat of userChats) {
    if (chat.members.length <= 1) {
      // If user is the only member, delete the chat completely
      await Chat.findByIdAndDelete(chat._id);
    } else {
      // Remove user from the chat members
      await Chat.findByIdAndUpdate(
        chat._id,
        { $pull: { members: id } }
      );
    }
  }
  
  // Delete direct messages sent by the user in other chats
  await Message.deleteMany({ sender: id });
  
  // Finally delete the user
  await User.findByIdAndDelete(id);
  
  return res.status(200).json({
    success: true,
    message: "User deleted successfully with all associated data",
  });
});

const getUserWithPassword = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  
  const user = await User.findById(id).select('+password');
  
  if (!user) return next(new ErrorHandler("User not found", 404));
  
  return res.status(200).json({
    success: true,
    user: {
      _id: user._id,
      name: user.name,
      username: user.username,
      password: user.password,
      avatar: user.avatar
    }
  });
});

const updateUser = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const { name, username, password } = req.body;
  
  const user = await User.findById(id);
  
  if (!user) return next(new ErrorHandler("User not found", 404));
  
  // Update user details
  if (name) user.name = name;
  if (username && username !== user.username) {
    // Check if username is already taken
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return next(new ErrorHandler("Username already exists", 400));
    }
    user.username = username;
  }
  
  if (password) {
    user.password = password; // Will be hashed by pre-save hook
  }
  
  await user.save();
  
  return res.status(200).json({
    success: true,
    message: "User updated successfully"
  });
});

const deleteMessage = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  
  // Find the message first to ensure it exists
  const message = await Message.findById(id);
  
  if (!message) return next(new ErrorHandler("Message not found", 404));
  
  // Delete the message
  await Message.findByIdAndDelete(id);
  
  return res.status(200).json({
    success: true,
    message: "Message deleted successfully",
  });
});

const searchAdmin = TryCatch(async (req, res, next) => {
  const { query, type = "all" } = req.query;
  
  if (!query) {
    return res.status(200).json({
      success: true,
      results: {
        users: [],
        messages: []
      }
    });
  }
  
  const results = {
    users: [],
    messages: []
  };
  
  // Regular expression for case-insensitive search
  const searchRegex = new RegExp(query, "i");
  
  // Search users if type is "all" or "users"
  if (type === "all" || type === "users") {
    const users = await User.find({
      $or: [
        { name: { $regex: searchRegex } },
        { username: { $regex: searchRegex } }
      ]
    }).select("name username avatar");
    
    results.users = users.map(user => ({
      _id: user._id,
      name: user.name,
      username: user.username,
      avatar: user.avatar.url
    }));
  }
  
  // Search messages if type is "all" or "messages"
  if (type === "all" || type === "messages") {
    const messages = await Message.find({
      content: { $regex: searchRegex }
    })
      .populate("sender", "name avatar")
      .sort({ createdAt: -1 })
      .limit(20);
    
    results.messages = messages.map(message => ({
      _id: message._id,
      content: message.content,
      createdAt: message.createdAt,
      sender: {
        _id: message.sender._id,
        name: message.sender.name,
        avatar: message.sender.avatar.url
      }
    }));
  }
  
  return res.status(200).json({
    success: true,
    results
  });
});

export {
  allUsers,
  allChats,
  allMessages,
  getDashboardStats,
  adminLogin,
  adminLogout,
  getAdminData,
  deleteUser,
  getUserWithPassword,
  updateUser,
  deleteMessage,
  searchAdmin
};
