// controllers/notification.controller.js
const Notification = require('../models/social/Notification');
const User = require('../models/user/user.js');
const mongoose = require('mongoose');

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications with pagination
 * @access  Private
 */
exports.getNotifications = async (req, res) => {
  try {
    const { limit = 20, page = 1, unreadOnly = false } = req.query;
    
    // Build query
    const query = { recipient: req.user.id };
    
    if (unreadOnly === 'true') {
      query.read = false;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get notifications
    const notifications = await Notification.find(query)
      .populate('sender', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get counts
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      read: false
    });
    
    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching notifications'
    });
  }
};

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Private
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      read: false
    });
    
    res.json({
      success: true,
      unreadCount
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching unread count'
    });
  }
};

/**
 * @route   PUT /api/notifications/mark-read
 * @desc    Mark notifications as read
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
  try {
    const { notificationIds, all = false } = req.body;
    
    let query = { recipient: req.user.id };
    
    // Mark specific notifications or all
    if (!all && notificationIds && Array.isArray(notificationIds)) {
      // Validate IDs
      const validIds = notificationIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      
      if (validIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid notification IDs provided'
        });
      }
      
      query._id = { $in: validIds };
    } else if (!all) {
      return res.status(400).json({
        success: false,
        error: 'Either notification IDs or all flag must be provided'
      });
    }
    
    // Add unread filter
    query.read = false;
    
    // Update notifications
    const result = await Notification.updateMany(
      query,
      { $set: { read: true } }
    );
    
    res.json({
      success: true,
      count: result.modifiedCount,
      message: `Marked ${result.modifiedCount} notifications as read`
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Error marking notifications as read'
    });
  }
};

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Private
 */
exports.markOneAsRead = async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    // Validate notification ID
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification ID'
      });
    }
    
    // Find notification
    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: req.user.id
    });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    // Check if already read
    if (notification.read) {
      return res.json({
        success: true,
        message: 'Notification already marked as read'
      });
    }
    
    // Update notification
    notification.read = true;
    await notification.save();
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark one as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Error marking notification as read'
    });
  }
};

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    // Validate notification ID
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification ID'
      });
    }
    
    // Find and delete notification
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: req.user.id
    });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Error deleting notification'
    });
  }
};

/**
 * @route   GET /api/notifications/settings
 * @desc    Get notification settings
 * @access  Private
 */
exports.getNotificationSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('notificationPreferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // If no settings initialized, return defaults
    if (!user.notificationPreferences) {
      user.notificationPreferences = {
        email: {
          messages: true,
          connections: true,
          mentions: true,
          events: true,
          jobs: true,
          marketing: false
        },
        push: {
          messages: true,
          connections: true,
          mentions: true,
          events: true,
          jobs: true
        },
        inApp: {
          messages: true,
          connections: true,
          mentions: true,
          events: true,
          jobs: true
        }
      };
      
      await user.save();
    }
    
    res.json({
      success: true,
      settings: user.notificationPreferences
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching notification settings'
    });
  }
};

/**
 * @route   PUT /api/notifications/settings
 * @desc    Update notification settings
 * @access  Private
 */
exports.updateNotificationSettings = async (req, res) => {
  try {
    const { email, push, inApp } = req.body;
    
    // Validate at least one category
    if (!email && !push && !inApp) {
      return res.status(400).json({
        success: false,
        error: 'At least one notification category must be provided'
      });
    }
    
    // Find user
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Initialize notification preferences if not exist
    if (!user.notificationPreferences) {
      user.notificationPreferences = {
        email: {},
        push: {},
        inApp: {}
      };
    }
    
    // Update settings
    if (email) {
      user.notificationPreferences.email = {
        ...user.notificationPreferences.email,
        ...email
      };
    }
    
    if (push) {
      user.notificationPreferences.push = {
        ...user.notificationPreferences.push,
        ...push
      };
    }
    
    if (inApp) {
      user.notificationPreferences.inApp = {
        ...user.notificationPreferences.inApp,
        ...inApp
      };
    }
    
    await user.save();
    
    res.json({
      success: true,
      settings: user.notificationPreferences,
      message: 'Notification settings updated successfully'
    });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating notification settings'
    });
  }
};

module.exports = exports;