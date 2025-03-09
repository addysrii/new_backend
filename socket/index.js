const jwt = require('jsonwebtoken');
const User = require('../models/user.js');
const Message = require('../models/Message.js');
const Notification = require('../models/Notification');
const { createNotification } = require('../utils/helpers');

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

module.exports = (io) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    
    try {
      // Verify the token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Find the user
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return next(new Error('User not found'));
      }
      
      // Attach user to socket
      socket.user = {
        id: user._id,
        email: user.email
      };
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });
  
  // Handle connection
  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.user.id}`);
    
    // Join user's room for private messages
    socket.join(`user_${socket.user.id}`);
    
    // Update user status to online
    await User.findByIdAndUpdate(socket.user.id, {
      online: true,
      lastActive: new Date()
    });
    
    // Emit user's online status to connections
    const user = await User.findById(socket.user.id);
    
    if (user.privacy?.activityStatus !== 'nobody') {
      const connectionIds = 
        user.privacy?.activityStatus === 'connections' 
          ? user.connections
          : [...user.connections, ...user.followers];
          
      connectionIds.forEach(connectionId => {
        io.to(`user_${connectionId}`).emit('user_status_changed', {
          userId: socket.user.id,
          online: true
        });
      });
    }
    
    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.user.id}`);
      
      // Update user status to offline
      await User.findByIdAndUpdate(socket.user.id, {
        online: false,
        lastActive: new Date()
      });
      
      // Emit user's offline status to connections
      if (user.privacy?.activityStatus !== 'nobody') {
        const connectionIds = 
          user.privacy?.activityStatus === 'connections' 
            ? user.connections
            : [...user.connections, ...user.followers];
            
        connectionIds.forEach(connectionId => {
          io.to(`user_${connectionId}`).emit('user_status_changed', {
            userId: socket.user.id,
            online: false,
            lastActive: new Date()
          });
        });
      }
    });
    
    // Handle private message
    socket.on('private_message', async (data) => {
      try {
        const { recipientId, content, attachmentUrl, attachmentType } = data;
        
        // Create message
        const message = await Message.create({
          sender: socket.user.id,
          recipient: recipientId,
          content,
          attachmentUrl,
          attachmentType,
          createdAt: new Date()
        });
        
        // Get populated message
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'firstName lastName profilePicture')
          .populate('recipient', 'firstName lastName profilePicture');
        
        // Send to recipient if online
        io.to(`user_${recipientId}`).emit('private_message', populatedMessage);
        
        // Also send to sender (for multi-device sync)
        socket.emit('private_message_sent', populatedMessage);
        
        // Create notification for recipient
        const sender = await User.findById(socket.user.id);
        await createNotification({
          recipient: recipientId,
          sender: socket.user.id,
          type: 'message',
          contentType: 'message',
          contentId: message._id,
          text: `${sender.firstName} ${sender.lastName} sent you a message`,
          actionUrl: `/messages/${socket.user.id}`
        });
      } catch (error) {
        console.error('Private message error:', error);
        socket.emit('error', { message: 'Error sending message' });
      }
    });
    
    // Handle message read status
    socket.on('message_read', async (data) => {
      try {
        const { messageId } = data;
        
        const message = await Message.findById(messageId);
        
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }
        
        // Ensure user is the recipient
        if (message.recipient.toString() !== socket.user.id) {
          return socket.emit('error', { message: 'Unauthorized' });
        }
        
        // Update read status
        message.read = true;
        message.readAt = new Date();
        await message.save();
        
        // Notify sender
        io.to(`user_${message.sender}`).emit('message_read', {
          messageId,
          readAt: message.readAt
        });
      } catch (error) {
        console.error('Message read error:', error);
        socket.emit('error', { message: 'Error updating read status' });
      }
    });
    
    // Handle typing indicator
    socket.on('typing', (data) => {
      const { recipientId, isTyping } = data;
      
      // Emit typing status to recipient
      io.to(`user_${recipientId}`).emit('typing', {
        userId: socket.user.id,
        isTyping
      });
    });
    
    // Handle notification read
    socket.on('notification_read', async (data) => {
      try {
        const { notificationId } = data;
        
        if (notificationId === 'all') {
          // Mark all as read
          await Notification.updateMany(
            { recipient: socket.user.id, read: false },
            { $set: { read: true } }
          );
          
          socket.emit('all_notifications_read');
        } else {
          // Mark specific notification as read
          const notification = await Notification.findById(notificationId);
          
          if (!notification) {
            return socket.emit('error', { message: 'Notification not found' });
          }
          
          // Ensure user is the recipient
          if (notification.recipient.toString() !== socket.user.id) {
            return socket.emit('error', { message: 'Unauthorized' });
          }
          
          notification.read = true;
          await notification.save();
          
          socket.emit('notification_read', { notificationId });
        }
      } catch (error) {
        console.error('Notification read error:', error);
        socket.emit('error', { message: 'Error updating notification' });
      }
    });
    
    // Handle location sharing
    socket.on('location_update', async (data) => {
      try {
        const { latitude, longitude, accuracy, heading, speed } = data;
        
        if (!latitude || !longitude) {
          return socket.emit('error', { message: 'Coordinates required' });
        }
        
        // Check if user has location sharing enabled
        const user = await User.findById(socket.user.id);
        
        if (!user.locationSharing || !user.locationSharing.enabled) {
          return socket.emit('error', { message: 'Location sharing is not enabled' });
        }
        
        // Check if sharing has expired
        if (user.locationSharing.expiresAt && user.locationSharing.expiresAt < new Date()) {
          // Auto-disable expired sharing
          await User.findByIdAndUpdate(socket.user.id, {
            $set: { 'locationSharing.enabled': false }
          });
          
          return socket.emit('error', { 
            message: 'Location sharing has expired',
            expired: true
          });
        }
        
        // Update location in database
        const locationUpdate = {
          'location.coordinates': [parseFloat(longitude), parseFloat(latitude)],
          'location.accuracy': accuracy ? parseFloat(accuracy) : undefined,
          'location.heading': heading ? parseFloat(heading) : undefined,
          'location.speed': speed ? parseFloat(speed) : undefined,
          'location.lastUpdated': new Date()
        };
        
        // Only update fields that are provided
        Object.keys(locationUpdate).forEach(key => {
          if (locationUpdate[key] === undefined) {
            delete locationUpdate[key];
          }
        });
        
        await User.findByIdAndUpdate(socket.user.id, { $set: locationUpdate });
        
        // Determine which users can see this update
        let visibleToUserIds = [];
        
        if (user.locationSharing.visibleTo === 'connections') {
          visibleToUserIds = user.connections || [];
        } else if (user.locationSharing.visibleTo === 'selected') {
          visibleToUserIds = user.locationSharing.selectedUsers || [];
        } else if (user.locationSharing.visibleTo === 'everyone') {
          // For everyone, we don't need to emit to specific users
          // But in this implementation, we still need a list of users to send to
          // In a production app, you might use a room-based approach instead
          visibleToUserIds = [...user.connections || [], ...user.followers || []];
        }
        
        // Emit to users who can see this update
        visibleToUserIds.forEach(userId => {
          io.to(`user_${userId}`).emit('location_update', {
            userId: socket.user.id,
            name: `${user.firstName} ${user.lastName}`,
            location: {
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
              accuracy: accuracy ? parseFloat(accuracy) : null,
              heading: heading ? parseFloat(heading) : null,
              speed: speed ? parseFloat(speed) : null,
              lastUpdated: new Date()
            }
          });
        });
        
        socket.emit('location_update_success', {
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Location update error:', error);
        socket.emit('error', { message: 'Error updating location' });
      }
    });
    
    // Join a room for a specific content (like a post or event)
    socket.on('join_room', (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.user.id} joined room ${roomId}`);
    });
    
    // Leave a room
    socket.on('leave_room', (roomId) => {
      socket.leave(roomId);
      console.log(`User ${socket.user.id} left room ${roomId}`);
    });
    
    // Handle comment on content
    socket.on('content_comment', (data) => {
      // Broadcast the comment to everyone in the room
      socket.to(data.contentId).emit('new_comment', data);
    });
  });
  
  return io;
};