const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    trim: true
  },
  attachmentUrl: String,
  attachmentType: {
    type: String,
    enum: ['image', 'video', 'document', 'audio', null]
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  deletedBySender: {
    type: Boolean,
    default: false
  },
  deletedByRecipient: {
    type: Boolean,
    default: false
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, read: 1 });

// Statics
messageSchema.statics.getConversation = async function(user1Id, user2Id, options = {}) {
  const query = {
    $or: [
      { 
        sender: user1Id, 
        recipient: user2Id,
        deletedBySender: false
      },
      { 
        sender: user2Id, 
        recipient: user1Id,
        deletedByRecipient: false
      }
    ]
  };
  
  // Apply date filter if provided
  if (options.before) {
    query.createdAt = { $lt: new Date(options.before) };
  }
  
  return this.find(query)
    .sort({ createdAt: options.sort || -1 })
    .skip(options.skip || 0)
    .limit(options.limit || 20)
    .populate('sender', 'firstName lastName profilePicture')
    .populate('recipient', 'firstName lastName profilePicture')
    .populate('replyTo');
};

messageSchema.statics.getConversationList = async function(userId, options = {}) {
  // Get distinct conversation partners
  const conversations = await this.aggregate([
    {
      $match: {
        $or: [
          { sender: mongoose.Types.ObjectId(userId), deletedBySender: false },
          { recipient: mongoose.Types.ObjectId(userId), deletedByRecipient: false }
        ]
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ['$sender', mongoose.Types.ObjectId(userId)] },
            '$recipient',
            '$sender'
          ]
        },
        lastMessage: { $first: '$$ROOT' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        _id: 1,
        lastMessage: 1,
        'user.firstName': 1,
        'user.lastName': 1,
        'user.profilePicture': 1,
        'user.online': 1,
        'user.lastActive': 1
      }
    },
    {
      $sort: { 'lastMessage.createdAt': -1 }
    },
    {
      $skip: options.skip || 0
    },
    {
      $limit: options.limit || 20
    }
  ]);
  
  // Count unread messages for each conversation
  const conversationsWithUnread = await Promise.all(
    conversations.map(async (convo) => {
      const unreadCount = await this.countDocuments({
        sender: convo._id,
        recipient: userId,
        read: false,
        deletedByRecipient: false
      });
      
      return {
        ...convo,
        unreadCount
      };
    })
  );
  
  return conversationsWithUnread;
};

messageSchema.statics.markAsRead = async function(messageIds, userId) {
  return this.updateMany(
    {
      _id: { $in: messageIds },
      recipient: userId,
      read: false
    },
    {
      $set: {
        read: true,
        readAt: new Date()
      }
    }
  );
};

messageSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({
    recipient: userId,
    read: false,
    deletedByRecipient: false
  });
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;