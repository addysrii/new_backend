// socket/index.js
const jwt = require('jsonwebtoken');
const User = require('../models/user/user.js')
const Message = require('../models/messaging/Message');
const ChatRoom = require('../models/messaging/chatroom');
const chatSocket = require('./chat.socket');
const notificationSocket = require('./notification.socket');
const locationSocket = require('./location.socket');

/**
 * Socket.io setup and connection handler
 * @param {Object} io Socket.io instance
 */
module.exports = (io) => {
  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret-key');
      
      // Check if user exists
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }
      
      // Store user data in socket
      socket.userId = user._id.toString();
      socket.userData = {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      };
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle connection
  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.userId}`);
    
    try {
      // Set user as online
      await User.findByIdAndUpdate(socket.userId, {
        online: true,
        lastActive: new Date()
      });
      
      // Join user's personal room for direct messages and notifications
      socket.join(`user:${socket.userId}`);
      
      // Notify user's connections that they came online
      const user = await User.findById(socket.userId).select('connections');
      
      if (user && user.connections && user.connections.length > 0) {
        user.connections.forEach(connectionId => {
          io.to(`user:${connectionId}`).emit('user:status', {
            userId: socket.userId,
            status: 'online'
          });
        });
      }
      
      // Get user's chat rooms and join those rooms
      const chatRooms = await ChatRoom.find({
        participants: socket.userId
      });
      
      chatRooms.forEach(room => {
        socket.join(`chat:${room._id}`);
      });
      
      // Initialize socket handlers
      chatSocket(io, socket);
      notificationSocket(io, socket);
      locationSocket(io, socket);
      
      // Handle disconnect
      socket.on('disconnect', async () => {
        try {
          console.log(`User disconnected: ${socket.userId}`);
          
          // Set user as offline
          await User.findByIdAndUpdate(socket.userId, {
            online: false,
            lastActive: new Date()
          });
          
          // Notify user's connections that they went offline
          if (user && user.connections && user.connections.length > 0) {
            user.connections.forEach(connectionId => {
              io.to(`user:${connectionId}`).emit('user:status', {
                userId: socket.userId,
                status: 'offline',
                lastActive: new Date()
              });
            });
          }
        } catch (error) {
          console.error('Disconnect error:', error);
        }
      });
    }catch (error) {
        console.error('Socket connection error:', error);
        socket.disconnect();
      }
    });
  };