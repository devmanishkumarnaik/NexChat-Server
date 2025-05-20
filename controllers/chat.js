import { TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "../models/chat.js";
import { deleteFilesFromCloudinary, emitEvent, uploadFilesToCloudinary } from "../utils/features.js";
import {
  ALERT,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  REFETCH_CHATS,
  MESSAGE_DELETED,
  MESSAGE_EDITED,
  POLL_VOTE_UPDATED,
} from "../constants/events.js";
import { getOtherMember } from "../lib/helper.js";
import { User } from "../models/user.js";
import { Message } from "../models/message.js";

const newGroupChat = TryCatch(async (req, res, next) => {
  const { name, members } = req.body;

  const allMembers = [...members, req.user];

  await Chat.create({
    name,
    groupChat: true,
    creator: req.user,
    members: allMembers,
  });

  emitEvent(req, ALERT, allMembers, `Welcome to ${name} group`);
  emitEvent(req, REFETCH_CHATS, members);

  return res.status(201).json({
    success: true,
    message: "Group Created",
  });
});

const getMyChats = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({ members: req.user }).populate(
    "members",
    "name avatar"
  );

  const transformChats = chats.map(({ _id, name, members, groupChat }) => {
    const otherMember = getOtherMember(members, req.user);
    return {
      _id,
      groupChat,
      avatar: groupChat
        ? members.slice(0, 3).map(({ avatar }) => avatar.url)
        : [otherMember.avatar.url],
      name: groupChat ? name : otherMember.name,
      members: members.reduce((prev, curr) => {
        if (curr._id.toString() !== req.user.toString()) {
          prev.push(curr._id);
        }
        return prev;
      }, []),
    };
  });

  return res.status(200).json({
    success: true,
    chats: transformChats,
  });
});

const getMyGroups = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({
    members: req.user,
    groupChat: true,
    creator: req.user,
  }).populate("members", "name avatar");

  const groups = chats.map(({ members, _id, groupChat, name }) => ({
    _id,
    groupChat,
    name,
    avatar: members.slice(0, 3).map(({ avatar }) => avatar.url),
  }));

  return res.status(200).json({
    success: true,
    groups,
  });
});

const addMembers = TryCatch(async (req, res, next) => {
  const { chatId, members } = req.body;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  const allNewMembersPromise = members.map((i) => User.findById(i, "name"));

  const allNewMembers = await Promise.all(allNewMembersPromise);

  const uniqueMembers = allNewMembers
    .filter((i) => !chat.members.includes(i._id.toString()))
    .map((i) => i._id);

  chat.members.push(...uniqueMembers);

  if (chat.members.length > 100)
    return next(new ErrorHandler("Group members limit reached", 400));

  await chat.save();

  const allUsersName = allNewMembers.map((i) => i.name).join(",");

  emitEvent(
    req,
    ALERT,
    chat.members,
    `${allUsersName} has been added in the group`
  );

  emitEvent(req, REFETCH_CHATS, chat.members);

  return res.status(200).json({
    success: true,
    message: "Members added successfully",
  });
});

const removeMember = TryCatch(async (req, res, next) => {
  const { userId, chatId } = req.body;

  const [chat, userThatWillBeRemoved] = await Promise.all([
    Chat.findById(chatId),
    User.findById(userId, "name"),
  ]);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  if (chat.members.length <= 3)
    return next(new ErrorHandler("Group must have at least 3 members", 400));

   const allChatMembers = chat.members.map((i)=>i.toString());

  chat.members = chat.members.filter(
    (member) => member.toString() !== userId.toString()
  );

  await chat.save();

  emitEvent(
    req,
    ALERT,
    chat.members,
    {message: `${userThatWillBeRemoved.name} has been removed from the group`, chatId}
  );

  emitEvent(req, REFETCH_CHATS, allChatMembers);

  return res.status(200).json({
    success: true,
    message: "Member removed successfully",
  });
});

const leaveGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  const remainingMembers = chat.members.filter(
    (member) => member.toString() !== req.user.toString()
  );

  if (remainingMembers.length < 3)
    return next(new ErrorHandler("Group must have at least 3 members", 400));

  if (chat.creator.toString() === req.user.toString()) {
    const randomElement = Math.floor(Math.random() * remainingMembers.length);

    const newCreator = remainingMembers[randomElement];
    chat.creator = newCreator;
  }

  chat.members = remainingMembers;

  const [user] = await Promise.all([
    User.findById(req.user, "name"),
    chat.save(),
  ]);

  emitEvent(req, ALERT, chat.members, {chatId, message: `User ${user.name} has left the group`});

  return res.status(200).json({
    success: true,
    message: "Leave Group successfully",
  });
});

const sendAttachments = TryCatch(async (req, res, next) => {
  const { chatId } = req.body;
  const files = req.files || [];

  if(files.length < 1)
    return next(new ErrorHandler("Please Upload Attachments", 400));

  if(files.length > 5)
    return next(new ErrorHandler("Files Can't be more than 5", 400));

  const [chat, me] = await Promise.all([
    Chat.findById(chatId),
    User.findById(req.user, "name"),
  ]);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));


  if (files.length < 1)
    return next(new ErrorHandler("Please provide attachments", 400));

  //Upload files here-----------
  const attachments = await uploadFilesToCloudinary(files);

  const messageForDB = {
    content: "",
    attachments,
    sender: me._id,
    chat: chatId,
  };

  const messageForRealTime = {
    ...messageForDB,
    sender: {
      _id: me._id,
      name: me.name,
    },
  };

  const message = await Message.create(messageForDB);

  emitEvent(req, NEW_MESSAGE, chat.members, {
    message: messageForRealTime,
    chatId,
  });

  emitEvent(req, NEW_MESSAGE_ALERT, chat.members, { chatId });

  return res.status(200).json({
    success: true,
    message,
  });
});

const sendLocation = TryCatch(async (req, res, next) => {
  const { chatId, location } = req.body;
  
  if (!chatId) 
    return next(new ErrorHandler("Chat ID is required", 400));
    
  if (!location || !location.latitude || !location.longitude)
    return next(new ErrorHandler("Location data is required", 400));
  
  const [chat, me] = await Promise.all([
    Chat.findById(chatId),
    User.findById(req.user, "name"),
  ]);

  if (!chat) 
    return next(new ErrorHandler("Chat not found", 404));
  
  // Create a location message
  const messageForDB = {
    content: "Shared a location",
    sender: me._id,
    chat: chatId,
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      url: location.url,
      timestamp: location.timestamp || new Date().toISOString()
    }
  };

  const messageForRealTime = {
    ...messageForDB,
    sender: {
      _id: me._id,
      name: me.name,
    },
  };

  const message = await Message.create(messageForDB);

  emitEvent(req, NEW_MESSAGE, chat.members, {
    message: messageForRealTime,
    chatId,
  });

  emitEvent(req, NEW_MESSAGE_ALERT, chat.members, { chatId });

  return res.status(200).json({
    success: true,
    message,
  });
});

const sendPoll = TryCatch(async (req, res, next) => {
  const { chatId, question, options, multipleAnswers, duration } = req.body;
  
  if (!chatId) 
    return next(new ErrorHandler("Chat ID is required", 400));
    
  if (!question) 
    return next(new ErrorHandler("Poll question is required", 400));
    
  if (!options || !Array.isArray(options) || options.length < 2) 
    return next(new ErrorHandler("At least 2 poll options are required", 400));

  // Limit options to 10
  if (options.length > 10)
    return next(new ErrorHandler("Poll options cannot exceed 10", 400));
    
  const [chat, me] = await Promise.all([
    Chat.findById(chatId),
    User.findById(req.user, "name"),
  ]);

  if (!chat) 
    return next(new ErrorHandler("Chat not found", 404));
  
  // Calculate end time from duration (in minutes)
  const endTime = duration ? new Date(Date.now() + duration * 60 * 1000) : null;
  
  // Create formatted options with empty votes array
  const formattedOptions = options.map(option => ({
    text: option,
    votes: []
  }));
  
  // Create a poll message
  const messageForDB = {
    content: "Created a poll",
    sender: me._id,
    chat: chatId,
    poll: {
      question,
      options: formattedOptions,
      multipleAnswers: multipleAnswers || false,
      endTime
    }
  };

  const messageForRealTime = {
    ...messageForDB,
    sender: {
      _id: me._id,
      name: me.name,
    },
  };

  const message = await Message.create(messageForDB);

  emitEvent(req, NEW_MESSAGE, chat.members, {
    message: messageForRealTime,
    chatId,
  });

  emitEvent(req, NEW_MESSAGE_ALERT, chat.members, { chatId });

  return res.status(200).json({
    success: true,
    message,
  });
});

const votePoll = TryCatch(async (req, res, next) => {
  const { messageId, optionIndex } = req.body;
  
  // Basic validation
  if (!messageId) 
    return next(new ErrorHandler("Message ID is required", 400));
    
  if (optionIndex === undefined || optionIndex < 0) 
    return next(new ErrorHandler("Valid option index is required", 400));
  
  try {
    // Find the message with the poll
    const message = await Message.findById(messageId);
    
    if (!message || !message.poll) 
      return next(new ErrorHandler("Poll not found", 404));
    
    // Check if poll has ended
    if (message.poll.endTime && new Date(message.poll.endTime) < new Date()) 
      return next(new ErrorHandler("Poll has ended", 400));
    
    // Check if option index is valid
    if (optionIndex >= message.poll.options.length) 
      return next(new ErrorHandler("Invalid option index", 400));
      
    const chat = await Chat.findById(message.chat);
    
    if (!chat) 
      return next(new ErrorHandler("Chat not found", 404));
    
    // Get user ID
    const userId = req.user;
    
    // Check if multiple answers are allowed
    if (!message.poll.multipleAnswers) {
      // If not multiple answers, remove user's vote from all options
      message.poll.options.forEach(option => {
        const voteIndex = option.votes.findIndex(vote => vote.toString() === userId.toString());
        if (voteIndex !== -1) {
          option.votes.splice(voteIndex, 1);
        }
      });
    }
    
    // Check if user has already voted for this option
    const selectedOption = message.poll.options[optionIndex];
    const alreadyVoted = selectedOption.votes.some(vote => vote.toString() === userId.toString());
    
    if (alreadyVoted) {
      // Remove vote if already voted
      const voteIndex = selectedOption.votes.findIndex(vote => vote.toString() === userId.toString());
      selectedOption.votes.splice(voteIndex, 1);
    } else {
      // Add vote
      selectedOption.votes.push(userId);
    }
    
    await message.save();
    
    // Notify all chat members about the vote update
    emitEvent(req, POLL_VOTE_UPDATED, chat.members, {
      messageId,
      poll: message.poll,
      chatId: chat._id
    });
    
    return res.status(200).json({
      success: true,
      message: "Vote updated successfully",
      poll: message.poll
    });
  } catch (error) {
    // Check for specific MongoDB errors
    if (error.name === 'CastError' && error.path === '_id') {
      return next(new ErrorHandler("Invalid message ID format", 400));
    }
    // Pass other errors to the general error handler
    return next(error);
  }
});

const getChatDetails = TryCatch(async (req, res, next) => {
  if (req.query.populate === "true") {
    const chat = await Chat.findById(req.params.id)
      .populate("members", "name avatar")
      .lean();

    if (!chat) return next(new ErrorHandler("Chat not found", 404));

    chat.members = chat.members.map(({ _id, name, avatar }) => ({
      _id,
      name,
      avatar: avatar.url,
    }));

    return res.status(200).json({
      success: true,
      chat,
    });
  } else {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return next(new ErrorHandler("Chat not found", 404));

    return res.status(200).json({
      success: true,
      chat,
    });
  }
});

const renameGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const { name } = req.body;

  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(
      new ErrorHandler("You are not allowed to rename the group", 403)
    );

  chat.name = name;
  await chat.save();

  emitEvent(req, REFETCH_CHATS, chat.members);

  return res.status(200).json({
    success: true,
    message: "Group renamed successfully",
  });
});

const deleteChat = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  const members = chat.members;

  if (chat.groupChat && chat.creator.toString() !== req.user.toString())
    return next(
      new ErrorHandler("You are not allowed to delete the group", 403)
    );

  if (!chat.groupChat && !chat.members.includes(req.user.toString())) {
    return next(
      new ErrorHandler("You are not allowed to delete the chat", 403)
    );
  }

  //Here we have to delete All Messages as well as attachments or files from cloudinary

  const messagesWithAttachments = await Message.find({
    chat: chatId,
    attachments: { $exists: true, $ne: [] },
  });

  const public_ids = [];

  messagesWithAttachments.forEach(({ attachments }) =>
    attachments.forEach(({ public_id }) => public_ids.push(public_id))
  );

  await Promise.all([
    deleteFilesFromCloudinary(public_ids),
    chat.deleteOne(),
    Message.deleteMany({chat: chatId})
  ]);

  emitEvent(req, REFETCH_CHATS, members);
  return res.status(200).json({
    success: true,
    message: "Chat deleted successfully"
  })
});

const getMessages = TryCatch(async (req, res, next)=>{
   const chatId = req.params.id;
   const {page = 1} = req.query;

   const resultPerPage = 20;
   const skip = (page - 1) * resultPerPage;

   const chat = await Chat.findById(chatId);

   if(!chat) return next(new ErrorHandler("Chat not found", 404));

   if(!chat.members.includes(req.user.toString()))
      return next(
         new ErrorHandler("You are not allowed to access this chat", 403)
      );

   const [messages, totalMessagesCount] = await Promise.all([
    Message.find({chat: chatId})
       .sort({createdAt: -1})
       .skip(skip)
       .limit(resultPerPage)
       .populate("sender", "name")
       .lean(),
       Message.countDocuments({chat: chatId})
   ])

   const totalPages = Math.ceil(totalMessagesCount/resultPerPage) || 0;

   return res.status(200).json({
    success: true,
    messages: messages.reverse(),
    totalPages
   })
});

const deleteMessage = TryCatch(async (req, res, next) => {
  const messageId = req.params.id;

  // Find the message
  const message = await Message.findById(messageId);
  
  if (!message) return next(new ErrorHandler("Message not found", 404));
  
  // Check if the user is the sender of the message
  if (message.sender.toString() !== req.user.toString()) {
    return next(new ErrorHandler("You can only delete your own messages", 403));
  }
  
  // Get chat info for notification
  const chat = await Chat.findById(message.chat);
  
  if (!chat) return next(new ErrorHandler("Chat not found", 404));
  
  // If message has attachments, delete them from cloudinary
  if (message.attachments && message.attachments.length > 0) {
    const public_ids = message.attachments.map(attachment => attachment.public_id);
    await deleteFilesFromCloudinary(public_ids);
  }
  
  // Delete the message
  await message.deleteOne();
  
  // Notify other members of the chat
  emitEvent(req, MESSAGE_DELETED, chat.members, { 
    messageId, 
    chatId: chat._id 
  });
  
  return res.status(200).json({
    success: true,
    message: "Message deleted successfully"
  });
});

const editMessage = TryCatch(async (req, res, next) => {
  const messageId = req.params.id;
  const { content } = req.body;
  
  if (!content || content.trim() === '') 
    return next(new ErrorHandler("Message content cannot be empty", 400));
  
  // Find the message
  const message = await Message.findById(messageId);
  
  if (!message) return next(new ErrorHandler("Message not found", 404));
  
  // Check if the user is the sender of the message
  if (message.sender.toString() !== req.user.toString()) {
    return next(new ErrorHandler("You can only edit your own messages", 403));
  }
  
  // Get chat info for notification
  const chat = await Chat.findById(message.chat);
  
  if (!chat) return next(new ErrorHandler("Chat not found", 404));
  
  // Update the message content
  message.content = content;
  await message.save();
  
  // Notify other members of the chat
  emitEvent(req, MESSAGE_EDITED, chat.members, { 
    messageId, 
    chatId: chat._id,
    content
  });
  
  return res.status(200).json({
    success: true,
    message: "Message edited successfully"
  });
});

export {
  newGroupChat,
  getMyChats,
  getMyGroups,
  addMembers,
  removeMember,
  leaveGroup,
  sendAttachments,
  sendLocation,
  sendPoll,
  votePoll,
  getChatDetails,
  renameGroup,
  deleteChat,
  getMessages,
  deleteMessage,
  editMessage
};
