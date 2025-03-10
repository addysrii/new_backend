const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: [
      'message', 'connection_request', 'connection_accepted', 
      'mention', 'like', 'comment', 'follow', 'event_invite',
      'project_collaboration', 'job_recommendation', 'endorsement',
      'recommendation', 'streak_support', 'achievement',
      'event_rsvp', 'event_interest', 'new_episode', 'podcast_subscription',
      'job_application', 'stream_scheduled', 'stream_started', 'new_subscriber',
      'reply', 'reaction', 'group_join_request', 'location_sharing'
    ],
    required: true
  },
  contentType: {
    type: String,
    enum: [
      'post', 'comment', 'message', 'user', 'event', 'podcast', 
      'job', 'project', 'streak', 'achievement', 'subscription', 
      'stream', 'recommendation', 'skill', 'group', 'location'
    ],
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  actionUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ sender: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ contentType: 1, contentId: 1 });

// Statics
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ recipient: userId, read: false });
};

notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { recipient: userId, read: false },
    { $set: { read: true } }
  );
};

notificationSchema.statics.getGroupedNotifications = async function(userId, limit = 20, skip = 0) {
  // Get base notifications
  const notifications = await this.find({ recipient: userId })
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
          groupMap[key].text = `${senders[0].firstName} and ${senders[1].firstName} ${getActionVerb(notification.type)} your ${notification.contentType}`;
        } else if (senders.length > 2) {
          groupMap[key].text = `${senders[0].firstName}, ${senders[1].firstName}, and ${senders.length - 2} others ${getActionVerb(notification.type)} your ${notification.contentType}`;
        }
      }
    }
  });
  
  return grouped;
};

// Helper function for readable verbs
function getActionVerb(type) {
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

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;