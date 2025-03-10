const Notification = require('../models/social/Notification');
const User = require('../models/user/User');

/**
 * Notification Service
 * Handles creating and managing notifications
 */
class NotificationService {
  /**
   * Create a notification 
   * @param {Object} data Notification data
   * @returns {Promise<Object>} Created notification
   */
  async createNotification(data) {
    try {
      // Validate required fields
      if (!data.recipient || !data.type || !data.contentType || !data.contentId || !data.text) {
        throw new Error('Missing required notification fields');
      }
      
      // Create the notification
      const notification = await Notification.create(data);
      
      // Return the created notification
      return notification;
    } catch (error) {
      console.error('Create notification error:', error);
      throw error;
    }
  }
  
  /**
   * Get notifications for a user
   * @param {string} userId User ID
   * @param {Object} options Query options
   * @returns {Promise<Array>} User's notifications
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const { limit = 20, skip = 0, unreadOnly = false } = options;
      
      // Build query
      const query = { recipient: userId };
      
      if (unreadOnly) {
        query.read = false;
      }
      
      // Get notifications
      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'firstName lastName profilePicture')
        .lean();
      
      // Get unread count
      const unreadCount = await Notification.countDocuments({ 
        recipient: userId, 
        read: false 
      });
      
      return {
        notifications,
        unreadCount,
        hasMore: notifications.length === limit
      };
    } catch (error) {
      console.error('Get user notifications error:', error);
      throw error;
    }
  }
  
  /**
   * Mark notifications as read
   * @param {string} userId User ID
   * @param {string} notificationId Specific notification ID (optional)
   * @returns {Promise<Object>} Result
   */
  async markAsRead(userId, notificationId = null) {
    try {
      let query = { recipient: userId };
      
      // If specific notification ID is provided, only mark that one
      if (notificationId) {
        query._id = notificationId;
      }
      
      const result = await Notification.updateMany(
        query,
        { $set: { read: true } }
      );
      
      return {
        success: true,
        modified: result.nModified
      };
    } catch (error) {
      console.error('Mark notifications as read error:', error);
      throw error;
    }
  }
  
  /**
   * Get grouped notifications
   * @param {string} userId User ID
   * @param {Object} options Query options
   * @returns {Promise<Array>} Grouped notifications
   */
  async getGroupedNotifications(userId, options = {}) {
    try {
      const { limit = 20, skip = 0 } = options;
      
      // Get base notifications
      const notifications = await Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'firstName lastName profilePicture')
        .lean();
      
      // Group similar notifications by type and contentId
      const grouped = [];
      const groupMap = {};
      
      notifications.forEach(notification => {
        // Define grouping key based on notification type and content
        const key = `${notification.type}-${notification.contentId}-${notification.contentType}`;
        
        // If this is the first notification of its kind
        if (!groupMap[key]) {
          // Create a new group
          groupMap[key] = {
            ...notification,
            count: 1,
            groupMembers: [notification]
          };
          grouped.push(groupMap[key]);
        } else {
          // Add to existing group
          groupMap[key].count++;
          groupMap[key].groupMembers.push(notification);
          
          // Update text for multiple users (e.g., "X, Y, and Z liked your post")
          if (['like', 'comment', 'reaction'].includes(notification.type)) {
            const senders = groupMap[key].groupMembers.map(n => n.sender);
            
            if (senders.length === 2) {
              groupMap[key].text = `${senders[0].firstName} and ${senders[1].firstName} ${this._getActionVerb(notification.type)} your ${notification.contentType}`;
            } else if (senders.length > 2) {
              groupMap[key].text = `${senders[0].firstName}, ${senders[1].firstName}, and ${senders.length - 2} others ${this._getActionVerb(notification.type)} your ${notification.contentType}`;
            }
          }
        }
      });
      
      return grouped;
    } catch (error) {
      console.error('Get grouped notifications error:', error);
      throw error;
    }
  }
  
  /**
   * Helper function for readable verbs
   * @private
   */
  _getActionVerb(type) {
    switch (type) {
      case 'like': return 'liked';
      case 'reaction': return 'reacted to';
      case 'comment': return 'commented on';
      case 'follow': return 'followed';
      case 'connection_request': return 'want to connect with';
      case 'mention': return 'mentioned you in';
      default: return 'interacted with';
    }
  }
}

module.exports = new NotificationService();