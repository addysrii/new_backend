// socket/notification.socket.js
const Notification = require('../models/social/Notification');
const User = require('../models/user/user.js');
const mongoose = require('mongoose');

/**
 * Notification socket handler
 * @param {Object} io Socket.io instance
 * @param {Object} socket Socket instance
 */
module.exports = (io, socket) => {
  // Get unread notification count
  socket.on('notification:count', async () => {
    try {
      const unreadCount = await Notification.countDocuments({
        recipient: socket.userId,
        read: false
      });
      
      socket.emit('notification:count', { unreadCount });
    } catch (error) {
      console.error('Get notification count error:', error);
      socket.emit('error', { message: 'Error getting notification count' });
    }
  });
  
  // Mark notifications as read
  socket.on('notification:read', async (data) => {
    try {
      const { notificationIds, all = false } = data;
      
      let query = { recipient: socket.userId, read: false };
      
      // Mark specific notifications or all
      if (!all && notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
        // Validate IDs
        const validIds = notificationIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        
        if (validIds.length === 0) {
          return socket.emit('error', { message: 'No valid notification IDs provided' });
        }
        
        query._id = { $in: validIds };
      }
      
      // Update notifications
      const result = await Notification.updateMany(
        query,
        { $set: { read: true } }
      );
      
      // Get new unread count
      const unreadCount = await Notification.countDocuments({
        recipient: socket.userId,
        read: false
      });
      
      socket.emit('notification:read', {
        count: result.modifiedCount,
        unreadCount
      });
    } catch (error) {
      console.error('Mark notifications as read error:', error);
      socket.emit('error', { message: 'Error marking notifications as read' });
    }
  });
  
  // Subscribe to real-time notifications
  socket.on('notification:subscribe', async () => {
    try {
      // User is already subscribed to their own room
      // Just confirm subscription
      socket.emit('notification:subscribed');
      
      // Send initial unread count
      const unreadCount = await Notification.countDocuments({
        recipient: socket.userId,
        read: false
      });
      
      socket.emit('notification:count', { unreadCount });
    } catch (error) {
      console.error('Notification subscribe error:', error);
      socket.emit('error', { message: 'Error subscribing to notifications' });
    }
  });
  
  // Function to create and emit a notification
  socket.createAndEmitNotification = async (notificationData) => {
    try {
      // Validate recipient
      if (!notificationData.recipient || !mongoose.Types.ObjectId.isValid(notificationData.recipient)) {
        return;
      }
      
      // Create notification
      const notification = await Notification.create({
        ...notificationData,
        sender: socket.userId,
        createdAt: new Date()
      });
      
      // Populate sender info
      await notification.populate('sender', 'firstName lastName profilePicture');
      
      // Emit to recipient
      io.to(`user:${notificationData.recipient}`).emit('notification:new', notification);
      
      return notification;
    } catch (error) {
      console.error('Create and emit notification error:', error);
      return null;
    }
  };
};