const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');

module.exports = (io) => {
  // Socket.io middleware to authenticate users
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token || 
                   socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }
      
      // More robust token verification
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        maxAge: '30d'
      });
      
      // Additional validation
      if (!decoded.id) {
        return next(new Error('Invalid token payload'));
      }
      
      socket.userId = decoded.id;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error(`Authentication failed: ${error.message}`));
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Authenticate socket connection
    socket.on('authenticate', async (data) => {
      try {
        const { token } = data;
        
        if (!token) {
          socket.emit('auth_error', { message: 'No token provided' });
          return;
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        
        // Join user-specific room
        socket.join(`user_${decoded.id}`);
        
        // Update user online status
        await User.findByIdAndUpdate(decoded.id, {
          online: true,
          lastActive: new Date()
        });
        
        // Get user's chats and join those rooms
        const chats = await ChatRoom.find({
          participants: decoded.id
        });
        
        chats.forEach(chat => {
          socket.join(`chat_${chat._id}`);
        });
        
        socket.emit('authenticated', { userId: decoded.id });
        
        // Notify connections that user is online
        const user = await User.findById(decoded.id);
        if (user && user.connections) {
          io.to(user.connections.map(id => `user_${id}`)).emit('user_online', {
            userId: decoded.id,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Socket authentication error:', error);
        socket.emit('auth_error', { message: 'Authentication failed' });
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log('Client disconnected:', socket.id);
      
      if (socket.userId) {
        // Update user offline status
        await User.findByIdAndUpdate(socket.userId, {
          online: false,
          lastActive: new Date()
        });
        
        // Notify connections that user is offline
        const user = await User.findById(socket.userId);
        if (user && user.connections) {
          io.to(user.connections.map(id => `user_${id}`)).emit('user_offline', {
            userId: socket.userId,
            timestamp: new Date()
          });
        }
      }
    });
    
    // New message event
    socket.on('new_message', async (data) => {
      try {
        const { chatId, message } = data;
        
        // Emit message to chat room
        socket.to(`chat_${chatId}`).emit('message_received', message);
        
        // Send push notifications to offline users
        const chat = await ChatRoom.findById(chatId);
        if (chat) {
          const offlineParticipants = await User.find({
            _id: { $in: chat.participants, $ne: socket.userId },
            online: false
          });
          
          // Here you would integrate with your push notification service
          // This is just a placeholder
          console.log(`Would send push notifications to ${offlineParticipants.length} offline users`);
        }
      } catch (error) {
        console.error('New message socket error:', error);
      }
    });
    
    // Typing indicator
    socket.on('typing', (data) => {
      const { chatId, isTyping } = data;
      
      if (!socket.userId || !chatId) return;
      
      socket.to(`chat_${chatId}`).emit('typing_indicator', {
        chatId,
        userId: socket.userId,
        isTyping
      });
    });
    
    // Read receipts
    socket.on('mark_read', async (data) => {
      try {
        const { chatId, messageId } = data;
        
        if (!chatId || !messageId) return;
        
        // Update message as read
        await Message.findByIdAndUpdate(messageId, {
          read: true
        });
        
        // Notify other participants that message was read
        socket.to(`chat_${chatId}`).emit('message_read', {
          chatId,
          messageId,
          readBy: socket.userId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Mark read socket error:', error);
      }
    });
    
    // Call signaling events
    socket.on('call_started', async (data) => {
      const { chatId, callId, type, initiator } = data;
      
      // Notify other users in the chat
      socket.to(`chat_${chatId}`).emit('incoming_call', {
        chatId,
        callId,
        type,
        from: initiator
      });
    });
    
    socket.on('call_ice_candidate', (data) => {
      const { callId, candidate, targetUserId } = data;
      io.to(`user_${targetUserId}`).emit('call_ice_candidate', {
        callId,
        candidate,
        from: socket.userId
      });
    });
    
    socket.on('call_sdp_offer', (data) => {
      const { callId, sdp, targetUserId } = data;
      io.to(`user_${targetUserId}`).emit('call_sdp_offer', {
        callId,
        sdp,
        from: socket.userId
      });
    });
    
    socket.on('call_sdp_answer', (data) => {
      const { callId, sdp, targetUserId } = data;
      io.to(`user_${targetUserId}`).emit('call_sdp_answer', {
        callId,
        sdp,
        from: socket.userId
      });
    });
    
    // Poll events
    socket.on('poll_vote', (data) => {
      const { chatId, pollId, optionIndex } = data;
      
      // Broadcast vote to all chat participants
      socket.to(`chat_${chatId}`).emit('poll_updated', {
        chatId,
        pollId,
        voter: socket.userId,
        optionIndex
      });
    });
  });
};
