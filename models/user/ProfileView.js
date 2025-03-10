// models/user/ProfileView.js
const mongoose = require('mongoose');

/**
 * Schema for tracking profile views
 */
const profileViewSchema = new mongoose.Schema({
  // The user whose profile was viewed
  profileUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // The user who viewed the profile
  viewerUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // When the profile was viewed
  viewedAt: {
    type: Date,
    default: Date.now
  },
  
  // User agent information (optional)
  userAgent: String,
  
  // IP address (optional, for analytics)
  ipAddress: String,
  
  // Referrer URL (where the user came from)
  referrer: String
}, {
  timestamps: true
});

// Indexes for performance
profileViewSchema.index({ profileUser: 1, viewedAt: -1 });
profileViewSchema.index({ viewerUser: 1, profileUser: 1, viewedAt: -1 });
profileViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

const ProfileView = mongoose.model('ProfileView', profileViewSchema);

module.exports = ProfileView;