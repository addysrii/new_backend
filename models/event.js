const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  eventType: {
    type: String,
    enum: ['in-person', 'virtual', 'hybrid'],
    required: true
  },
  category: {
    type: String,
    required: true
  },
  tags: [String],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  location: {
    address: String,
    city: String,
    country: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    },
    virtual: {
      platform: String,
      link: String
    }
  },
  coverImage: String,
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['going', 'interested', 'not-going'],
      default: 'interested'
    },
    message: String,
    respondedAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    checkedIn: {
      type: Boolean,
      default: false
    },
    checkInTime: Date
  }],
  invitations: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    invitedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    }
  }],
  privacy: {
    type: String,
    enum: ['public', 'private', 'invite-only'],
    default: 'public'
  },
  checkInCode: String,
  views: {
    type: Number,
    default: 0
  },
  seriesId: mongoose.Schema.Types.ObjectId,
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrenceIndex: Number,
  recurrencePattern: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom', null],
    default: null
  },
  recurrenceSettings: {
    pattern: String,
    daysOfWeek: [Number],
    daysOfMonth: [Number],
    monthsOfYear: [Number],
    interval: Number,
    until: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
eventSchema.index({ creator: 1 });
eventSchema.index({ startDate: 1 });
eventSchema.index({ 'location.coordinates': '2dsphere' });
eventSchema.index({ privacy: 1 });
eventSchema.index({ 'attendees.user': 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ tags: 1 });

// Virtuals
eventSchema.virtual('attendeeCount').get(function() {
  return this.attendees ? this.attendees.filter(a => a.status === 'going').length : 0;
});

eventSchema.virtual('interestedCount').get(function() {
  return this.attendees ? this.attendees.filter(a => a.status === 'interested').length : 0;
});

eventSchema.virtual('isUpcoming').get(function() {
  return this.startDate > new Date();
});

// Static method to find events near a location
eventSchema.statics.findNearby = async function(coords, maxDistance = 50000, options = {}) {
  // coords should be [lng, lat]
  const query = {
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coords
        },
        $maxDistance: maxDistance // in meters
      }
    },
    // Default to upcoming events
    startDate: { $gte: new Date() },
    // Default to public events
    privacy: 'public',
    ...options.query
  };
  
  // Apply category filter if provided
  if (options.category) {
    query.category = options.category;
  }
  
  // Apply date range filter if provided
  if (options.startDate) {
    query.startDate = { $gte: new Date(options.startDate) };
  }
  
  if (options.endDate) {
    query.endDate = { $lte: new Date(options.endDate) };
  }
  
  // Apply tag filter if provided
  if (options.tags && options.tags.length > 0) {
    query.tags = { $in: options.tags };
  }
  
  return this.find(query)
    .sort(options.sort || { startDate: 1 })
    .skip(options.skip || 0)
    .limit(options.limit || 10)
    .populate(options.populate || 'creator')
    .lean();
};

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;