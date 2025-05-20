import { User } from "../models/user.js";
import { compare, hash } from "bcrypt";
import { cookieOptions, emitEvent, sendToken, uploadFilesToCloudinary, deleteFilesFromCloudinary } from "../utils/features.js";
import { TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "../models/chat.js";
import { Request } from "../models/request.js";
import { Message } from "../models/message.js";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/events.js";
import { getOtherMember } from "../lib/helper.js";
import crypto from "crypto";

//create a new user and save it to the database and save cookie
const newUser = TryCatch(async (req, res, next) => {
  const { name, username, password } = req.body;

  const file = req.file;

  if(!file) return next(new ErrorHandler("Please Upload Avatar"));

  const result = await uploadFilesToCloudinary([file]);

  const avatar = {
    public_id: result[0].public_id,
    url: result[0].url,
  };
  const user = await User.create({
    name,
    username,
    password,
    avatar,
  });

  sendToken(res, user, 201, "User Created");
});

//Login user and save token in cookie
const login = TryCatch(async (req, res, next) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username }).select("+password");

  if (!user) return next(new ErrorHandler("Invalid Username or Password", 404));

  const isMatch = await compare(password, user.password);

  if (!isMatch)
    return next(new ErrorHandler("Invalid Username or Password", 404));

  sendToken(res, user, 200, `Welcome Back, ${user.name}`);
});

const getMyProfile = TryCatch(async (req, res, next) => {
  const user = await User.findById(req.user);

  if (!user) return next(new ErrorHandler("User not found", 404));

  res.status(200).json({
    success: true,
    user,
  });
});

const logout = TryCatch(async (req, res) => {
  return res
    .status(200)
    .cookie("ChatApp2.0", "", { ...cookieOptions, maxAge: 0 })
    .json({
      success: true,
      message: "Logged out successfully",
    });
});

const searchUser = TryCatch(async (req, res) => {
  const { name = "" } = req.query;

  const myChats = await Chat.find({ groupChat: false, members: req.user });
  const allUsersFromChats = myChats.flatMap((chat) => chat.members);
  const allUsersExceptMeAndFriends = await User.find({
    _id: { $nin: allUsersFromChats },
    name: { $regex: name, $options: "i" },
  });

  const users = allUsersExceptMeAndFriends.map(({ _id, name, username, avatar }) => ({
    _id,
    name,
    username,
    avatar: avatar.url,
  }));

  return res.status(200).json({
    success: true,
    users,
  });
});

const sendFriendRequest = TryCatch(async (req, res, next) => {
  const { userId } = req.body;

  const request = await Request.findOne({
    $or: [
      { sender: req.user, receiver: userId },
      { sender: userId, receiver: req.user },
    ],
  });

  if (request) return next(new ErrorHandler("Request already sent", 400));

  await Request.create({
    sender: req.user,
    receiver: userId,
  });

  emitEvent(req, NEW_REQUEST, [userId]);

  return res.status(200).json({
    success: true,
    message: "Friend Request Sent",
  });
});

const acceptFriendRequest = TryCatch(async (req, res, next) => {
  const { requestId, accept } = req.body;

  const request = await Request.findById(requestId)
    .populate("sender", "name")
    .populate("receiver", "name");

  if (!request) return next(new ErrorHandler("Request not found", 400));

  if (request.receiver._id.toString() !== req.user.toString())
    return next(
      new ErrorHandler("You are not authorized to accept this request", 401)
    );

  if (!accept) {
    await request.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Friend Request Rejected",
    });
  }

  const members = [request.sender._id, request.receiver._id];

  await Promise.all([
    Chat.create({
      members,
      name: `${request.sender.name}-${request.receiver.name}`,
    }),
    request.deleteOne(),
  ]);

  emitEvent(req, REFETCH_CHATS, members);

  return res.status(200).json({
    success: true,
    message: "Friend Request Accepted",
    senderId: request.sender._id,
  });
});

const getMyNotifications = TryCatch(async (req, res) => {
  const requests = await Request.find({ receiver: req.user }).populate(
    "sender",
    "name avatar"
  );

  const allRequests = requests.map(({ _id, sender }) => ({
    _id,
    sender: {
      _id: sender._id,
      name: sender.name,
      avatar: sender.avatar.url,
    },
  }));

  return res.status(200).json({
    success: true,
    allRequests,
  });
});

const getMyFriends = TryCatch(async (req, res) => {
  const chatId = req.query.chatId;

  const chats = await Chat.find({
    members: req.user,
    groupChat: false,
  }).populate("members", "name avatar");

  const friends = chats.map(({ members }) => {
    const otherUser = getOtherMember(members, req.user);

    return {
      _id: otherUser._id,
      name: otherUser.name,
      avatar: otherUser.avatar.url,
    };
  });

  if (chatId) {
    const chat = await Chat.findById(chatId);

    const availableFriends = friends.filter(
      (friend) => !chat.members.includes(friend._id)
    );

    return res.status(200).json({
      success: true,
      friends: availableFriends,
    });
  } else {
    return res.status(200).json({
      success: true,
      friends,
    });
  }
});

const updateProfile = TryCatch(async (req, res, next) => {
  const { name, username } = req.body;
  const user = await User.findById(req.user);

  if (!user) return next(new ErrorHandler("User not found", 404));

  if (username && username !== user.username) {
    const usernameExists = await User.findOne({ username });
    if (usernameExists) 
      return next(new ErrorHandler("Username already exists", 400));
    
    user.username = username;
  }

  if (name) user.name = name;

  // Handle avatar update if file is present
  if (req.file) {
    const result = await uploadFilesToCloudinary([req.file]);
    user.avatar = {
      public_id: result[0].public_id,
      url: result[0].url,
    };
  }

  await user.save();

  return res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user: {
      _id: user._id,
      name: user.name,
      username: user.username,
      avatar: user.avatar,
      createdAt: user.createdAt
    }
  });
});

const changePassword = TryCatch(async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;

  // Validation
  if (!oldPassword || !newPassword)
    return next(new ErrorHandler("Please provide old and new password", 400));

  const user = await User.findById(req.user).select("+password");

  if (!user) return next(new ErrorHandler("User not found", 404));

  // Verify old password
  const isMatch = await compare(oldPassword, user.password);
  if (!isMatch) return next(new ErrorHandler("Incorrect old password", 400));

  // Update password
  user.password = newPassword;
  await user.save();

  return res.status(200).json({
    success: true,
    message: "Password changed successfully"
  });
});

const deleteAccount = TryCatch(async (req, res, next) => {
  const { username, password } = req.body;
  
  // Find user with password
  const user = await User.findById(req.user).select("+password");
  
  if (!user) return next(new ErrorHandler("User not found", 404));
  
  // Verify username
  if (user.username !== username) {
    return next(new ErrorHandler("Username doesn't match", 400));
  }
  
  // Verify password
  const isPasswordValid = await compare(password, user.password);
  if (!isPasswordValid) {
    return next(new ErrorHandler("Invalid password", 400));
  }
  
  // Find all chats where user is a member
  const userChats = await Chat.find({ members: user._id });
  
  // Get all chatIds
  const chatIds = userChats.map(chat => chat._id);
  
  // Find all messages with attachments in those chats
  const messagesToDelete = await Message.find({
    sender: user._id,
    attachments: { $exists: true, $ne: [] }
  });
  
  // Extract public_ids from attachments
  const public_ids = [];
  messagesToDelete.forEach(message => {
    if (message.attachments && message.attachments.length > 0) {
      message.attachments.forEach(attachment => {
        if (attachment.public_id) {
          public_ids.push(attachment.public_id);
        }
      });
    }
  });
  
  // Add user avatar public_id
  if (user.avatar && user.avatar.public_id) {
    public_ids.push(user.avatar.public_id);
  }
  
  // Delete files from cloudinary if any
  if (public_ids.length > 0) {
    await deleteFilesFromCloudinary(public_ids);
  }
  
  // Delete user's messages
  await Message.deleteMany({ sender: user._id });
  
  // Delete user's requests
  await Request.deleteMany({ 
    $or: [{ sender: user._id }, { receiver: user._id }] 
  });
  
  // Handle group chats (remove user from members)
  for (const chat of userChats) {
    if (chat.groupChat) {
      // If user is creator of group chat and has members
      if (chat.creator.toString() === user._id.toString() && chat.members.length > 1) {
        // Assign a new random creator
        const otherMembers = chat.members.filter(
          member => member.toString() !== user._id.toString()
        );
        
        if (otherMembers.length > 0) {
          const randomIndex = Math.floor(Math.random() * otherMembers.length);
          chat.creator = otherMembers[randomIndex];
          chat.members = chat.members.filter(
            member => member.toString() !== user._id.toString()
          );
          
          // If enough members remain, save the chat with new creator
          if (chat.members.length >= 3) {
            await chat.save();
            continue;
          }
        }
      } else if (chat.members.length > 3) {
        // If not creator, just remove from members if enough members remain
        chat.members = chat.members.filter(
          member => member.toString() !== user._id.toString()
        );
        await chat.save();
        continue;
      }
    }
    
    // For direct chats or group chats with too few members, delete the chat
    if (!chat.groupChat || chat.members.length <= 3) {
      await Chat.findByIdAndDelete(chat._id);
    }
  }
  
  // Finally delete the user
  await User.findByIdAndDelete(user._id);
  
  // Clear cookies
  return res
    .status(200)
    .cookie("ChatApp2.0", "", { ...cookieOptions, maxAge: 0 })
    .json({
      success: true,
      message: "Account deleted successfully"
    });
});

const forgotPassword = TryCatch(async (req, res, next) => {
  const { email } = req.body;
  
  if(!email) return next(new ErrorHandler("Please provide email", 400));
  
  // Find user with the provided email
  const user = await User.findOne({ email });
  
  // We don't want to reveal if the email exists in our database
  if(!user) {
    return res.status(200).json({
      success: true,
      message: "Password reset email sent if email exists in our records"
    });
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(20).toString("hex");
  
  // Hash token and set to resetPasswordToken field
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  
  // Set token expire time (10 minutes)
  const resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  
  // Update user with reset token details
  user.resetPasswordToken = resetPasswordToken;
  user.resetPasswordExpire = resetPasswordExpire;
  await user.save();
  
  // Create reset URL
  const resetUrl = `${req.protocol}://${req.get("host")}/reset-password/${resetToken}`;
  
  // In a real application, you would send an email with the reset URL
  // For this example, we'll just return the resetUrl in the response
  console.log("Password reset URL:", resetUrl);

  // Send email using Nodemailer
  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    host: 'smtp.example.com',
    port: 587,
    secure: false, // Use `true` for port 465, `false` for all other ports
    auth: {
      user: 'your_email@example.com',
      pass: 'your_email_password'
    },
  });

  const mailOptions = {
    from: 'your_email@example.com',
    to: 'manishkumarnaik01@gmail.com',
    subject: 'Password Reset Request',
    html: `<p>You are receiving this because you (or someone else) have requested the reset of a password. Please click on the following link, or paste this into your browser to complete the process:</p><p>${resetUrl}</p><p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        message: "Error sending email"
      });
    } else {
      console.log('Email sent: ' + info.response);
      return res.status(200).json({
        success: true,
        message: "Password reset email sent if email exists in our records",
        resetUrl // Only for development/testing
      });
    }
  });
});

const resetPassword = TryCatch(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;
  
  if(!password) return next(new ErrorHandler("Please provide a new password", 400));
  
  // Hash the token from params to match with the one in DB
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  
  // Find user with the token and check if token has expired
  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });
  
  if(!user) return next(new ErrorHandler("Reset token is invalid or has expired", 400));
  
  // Update password
  user.password = password;
  
  // Clear reset token fields
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  
  await user.save();
  
  return res.status(200).json({
    success: true,
    message: "Password has been reset successfully"
  });
});

export {
  login,
  newUser,
  getMyProfile,
  logout,
  searchUser,
  sendFriendRequest,
  acceptFriendRequest,
  getMyNotifications,
  getMyFriends,
  updateProfile,
  changePassword,
  deleteAccount,
  forgotPassword,
  resetPassword
};
