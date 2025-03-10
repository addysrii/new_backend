// socket/chat.socket.js
const ChatRoom = require('../models/messaging/chatroom.js');
const Message = require('../models/messaging/Message.js');
const User = require('../models/user/user.js');
const mongoose = require('mongoose');

/**
 * Chat socket handler
 * @param {Object} io Socket.io instance
 * @param {Object} socket Socket instance
 */
module.exports = (io, socket) => {
  // Join a chat room
  socket.on('chat:join', async (data) => {
    try {
      const { chatId } = data;
      
      if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
        return socket.emit('error', { message: 'Invalid chat ID' });
      }
      
      // Verify the user is a participant in the chat
      const chatRoom = await ChatRoom.findOne({
        _id: chatId,
        participants: socket.userId
      });
      
      if (!chatRoom) {
        return socket.emit('error', { message: 'Chat room not found or not authorized' });
      }
      
      // Join the chat room
      socket.join(`chat:${chatId}`);
      
      // Emit success message
      socket.emit('chat:joined', { chatId });
      
      // Get unread count for this chat
      const unreadCount = await Message.countDocuments({
        chatRoom: chatId,
        recipient: socket.userId,
        read: false
      });
      
      socket.emit('chat:unread', { chatId, unreadCount });
    } catch (error) {
      console.error('Chat join error:', error);
      socket.emit('error', { message: 'Error joining chat' });
    }
  });
  
  // Leave a chat room
  socket.on('chat:leave', (data) => {
    try {
      const { chatId } = data;
      
      if (!chatId) {
        return socket.emit('error', { message: 'Chat ID is required' });
      }
      
      socket.leave(`chat:${chatId}`);
      socket.emit('chat:left', { chatId });
    } catch (error) {
      console.error('Chat leave error:', error);
      socket.emit('error', { message: 'Error leaving chat' });
    }
  });
  
  // Send a message
  socket.on('chat:message', async (data) => {
    try {
      const { chatId, content, messageType = 'text', replyTo, mediaUrl } = data;
      
      if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
        return socket.emit('error', { message: 'Invalid chat ID' });
      }
      
      if (!content && !mediaUrl && messageType === 'text') {
        return socket.emit('error', { message: 'Message content is required' });
      }
      
      // Verify the user is a participant in the chat
      const chatRoom = await ChatRoom.findOne({
        _id: chatId,
        participants: socket.userId
      });
      
      if (!chatRoom) {
        return socket.emit('error', { message: 'Chat room not found or not authorized' });
      }
      
      // Determine recipient (for direct chats)
      const recipient = chatRoom.type === 'direct' 
        ? chatRoom.participants.find(p => p.toString() !== socket.userId)
        : null;
      
      // Create message object
      const messageData = {
        sender: socket.userId,
        chatRoom: chatId,
        recipient,
        content: content || '',
        messageType,
        createdAt: new Date()
      };
      
      // Add media URL if provided
      if (mediaUrl) {
        messageData.mediaUrl = mediaUrl;
        
        // Determine attachment type
        if (mediaUrl.match(/\.(jpg|jpeg|png|gif)$/i)) {
          messageData.attachmentType = 'image';
        } else if (mediaUrl.match(/\.(mp4|avi|mov|wmv)$/i)) {
          messageData.attachmentType = 'video';
        } else if (mediaUrl.match(/\.(mp3|wav|ogg)$/i)) {
          messageData.attachmentType = 'audio';
        } else {
          messageData.attachmentType = 'document';
        }
      }
      
      // Add reply reference if provided
      if (replyTo && mongoose.Types.ObjectId.isValid(replyTo)) {
        // Verify reply message exists
        const replyMessage = await Message.findById(replyTo);
        if (replyMessage) {
          messageData.replyTo = replyTo;
        }
      }
      
      // Create the message
      const message = await Message.create(messageData);
      
      // Populate sender details
      await message.populate('sender', 'firstName lastName profilePicture');
      
      // If replying to a message, populate that message too
      if (message.replyTo) {
        await message.populate({
          path: 'replyTo',
          select: 'content sender messageType mediaUrl',
          populate: {
            path: 'sender',
            select: 'firstName lastName profilePicture'
          }
        });
      }
      
      // Update chat room's last message and activity
      await ChatRoom.findByIdAndUpdate(chatId, {
        lastMessage: message._id,
        lastActivity: new Date()
      });
      
      // Emit message to chat room
      io.to(`chat:${chatId}`).emit('chat:message', message);
      
      // Emit to recipient's personal room for push notification
      if (recipient) {
        io.to(`user:${recipient}`).emit('notification:new', {
          type: 'message',
          sender: {
            _id: socket.userId,
            firstName: socket.userData.firstName,
            lastName: socket.userData.lastName
          },
          message: content,
          chatId
        });
      }
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Error sending message' });
    }
  });
  
  // Mark messages as read
  socket.on('chat:read', async (data) => {
    try {
      const { chatId, messageIds } = data;
      
      if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
        return socket.emit('error', { message: 'Invalid chat ID' });
      }
      
      // Verify the user is a participant in the chat
      const chatRoom = await ChatRoom.findOne({
        _id: chatId,
        participants: socket.userId
      });
      
      if (!chatRoom) {
        return socket.emit('error', { message: 'Chat room not found or not authorized' });
      }
      
      // If specific message IDs are provided, mark those as read
      if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            chatRoom: chatId,
            recipient: socket.userId,
            read: false
          },
          {
            $set: {
              read: true,
              readAt: new Date()
            }
          }
        );
      } else {
        // Otherwise mark all unread messages in this chat as read
        await Message.updateMany(
          {
            chatRoom: chatId,
            recipient: socket.userId,
            read: false
          },
          {
            $set: {
              read: true,
              readAt: new Date()
            }
          }
        );
      }
      
      // Emit read status update to chat room
      io.to(`chat:${chatId}`).emit('chat:read', {
        chatId,
        userId: socket.userId,
        messageIds
      });
    } catch (error) {
      console.error('Mark messages as read error:', error);
      socket.emit('error', { message: 'Error marking messages as read' });
    }
  });
  
  // Typing indicator
  socket.on('chat:typing', (data) => {
    try {
      const { chatId, isTyping } = data;
      
      if (!chatId) {
        return socket.emit('error', { message: 'Chat ID is required' });
      }
      
      // Emit typing status to chat room (except sender)
      socket.to(`chat:${chatId}`).emit('chat:typing', {
        chatId,
        userId: socket.userId,
        isTyping
      });
    } catch (error) {
      console.error('Typing indicator error:', error);
      socket.emit('error', { message: 'Error with typing indicator' });
    }
  });
  
  // Call signaling
  socket.on('call:signal', (data) => {
    try {
      const { chatId, recipientId, signal, callType } = data;
      
      if (!chatId || !recipientId || !signal) {
        return socket.emit('error', { message: 'Missing required fields' });
      }
      
      // Emit signal to recipient
      io.to(`user:${recipientId}`).emit('call:signal', {
        chatId,
        callerId: socket.userId,
        signal,
        callType
      });
    } catch (error) {
      console.error('Call signaling error:', error);
      socket.emit('error', { message: 'Error with call signaling' });
    }
  });
};