const mongoose = require('mongoose');

const mentionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mentionedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contentType: {
    type: String,
    enum: ['post', 'comment', 'message', 'event', 'project'],
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'contentType'
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
mentionSchema.index({ user: 1, read: 1 });
mentionSchema.index({ mentionedBy: 1 });
mentionSchema.index({ contentType: 1, contentId: 1 });
mentionSchema.index({ createdAt: -1 });

const Mention = mongoose.model('Mention', mentionSchema);

module.exports = Mention;