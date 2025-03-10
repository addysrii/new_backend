const mongoose = require('mongoose');

const hashtagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  postCount: {
    type: Number,
    default: 0
  },
  eventCount: {
    type: Number,
    default: 0
  },
  podcastCount: {
    type: Number,
    default: 0
  },
  jobCount: {
    type: Number,
    default: 0
  },
  followerCount: {
    type: Number,
    default: 0
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  trending: {
    type: Boolean,
    default: false
  },
  category: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
hashtagSchema.index({ name: 1 });
hashtagSchema.index({ trending: 1 });
hashtagSchema.index({ 
  postCount: -1, 
  eventCount: -1, 
  podcastCount: -1, 
  jobCount: -1 
});
hashtagSchema.index({ category: 1 });

// Virtual for total usage count
hashtagSchema.virtual('totalCount').get(function() {
  return this.postCount + this.eventCount + this.podcastCount + this.jobCount;
});

// Static methods
hashtagSchema.statics.getTopHashtags = function(limit = 10) {
  return this.aggregate([
    {
      $addFields: {
        totalCount: { 
          $add: ['$postCount', '$eventCount', '$podcastCount', '$jobCount'] 
        }
      }
    },
    { $sort: { totalCount: -1 } },
    { $limit: limit }
  ]);
};

hashtagSchema.statics.getTopHashtagsByCategory = function(category, limit = 10) {
  return this.aggregate([
    { $match: { category } },
    {
      $addFields: {
        totalCount: { 
          $add: ['$postCount', '$eventCount', '$podcastCount', '$jobCount'] 
        }
      }
    },
    { $sort: { totalCount: -1 } },
    { $limit: limit }
  ]);
};

hashtagSchema.statics.updateTrendingStatus = async function(topCount = 20) {
  // Get top hashtags based on total counts
  const topHashtags = await this.getTopHashtags(topCount);
  
  // Extract IDs of trending hashtags
  const trendingIds = topHashtags.map(tag => tag._id);
  
  // Set trending flag for top hashtags
  await this.updateMany(
    { _id: { $in: trendingIds } },
    { $set: { trending: true } }
  );
  
  // Remove trending flag from others
  await this.updateMany(
    { _id: { $nin: trendingIds } },
    { $set: { trending: false } }
  );
  
  return trendingIds;
};

const Hashtag = mongoose.model('Hashtag', hashtagSchema);

module.exports = Hashtag;