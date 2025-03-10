const Notification = require('../models/social/Notification.js')
const Hashtag = require('../models/discovery/Hashtag.js');

/**
 * Create a notification
 * @param {Object} data Notification data
 * @returns {Promise} Notification document
 */
exports.createNotification = async (data) => {
  try {
    return await Notification.create(data);
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

/**
 * Update hashtags usage counts
 * @param {Array} tags Array of tags
 * @param {String} contentType Type of content (post, event, podcast, job)
 * @param {Array} oldTags Array of previous tags (for updates)
 * @returns {Promise<Boolean>} Success status
 */
exports.updateHashtags = async (tags, contentType, oldTags = []) => {
  try {
    // Convert tags to lowercase
    const lowerTags = tags.map(tag => tag.toLowerCase());
    const lowerOldTags = oldTags.map(tag => tag.toLowerCase());
    
    // Find new tags
    const newTags = lowerTags.filter(tag => !lowerOldTags.includes(tag));
    
    // Find removed tags
    const removedTags = lowerOldTags.filter(tag => !lowerTags.includes(tag));
    
    // Update hashtag counts for new tags
    for (const tag of newTags) {
      const updateFields = {};
      
      switch (contentType) {
        case 'event':
          updateFields.eventCount = 1;
          break;
        case 'podcast':
          updateFields.podcastCount = 1;
          break;
        case 'job':
          updateFields.jobCount = 1;
          break;
        default:
          updateFields.postCount = 1;
      }
      
      await Hashtag.findOneAndUpdate(
        { name: tag },
        { 
          $inc: updateFields,
          $setOnInsert: { name: tag }
        },
        { upsert: true, new: true }
      );
    }
    
    // Update hashtag counts for removed tags
    for (const tag of removedTags) {
      const updateFields = {};
      
      switch (contentType) {
        case 'event':
          updateFields.eventCount = -1;
          break;
        case 'podcast':
          updateFields.podcastCount = -1;
          break;
        case 'job':
          updateFields.jobCount = -1;
          break;
        default:
          updateFields.postCount = -1;
      }
      
      await Hashtag.findOneAndUpdate(
        { name: tag },
        { $inc: updateFields }
      );
    }
    
    // Update trending status
    await Hashtag.updateTrendingStatus();
    
    return true;
  } catch (error) {
    console.error('Update hashtags error:', error);
    return false;
  }
};

/**
 * Check if two users are connected
 * @param {String} userId1 First user ID
 * @param {String} userId2 Second user ID
 * @returns {Promise<Boolean>} Connection status
 */
exports.areConnected = async (userId1, userId2) => {
  try {
    const User = require('../models/user.js');
    const user = await User.findById(userId1);
    return user && user.connections && user.connections.includes(userId2);
  } catch (error) {
    console.error('Check connection error:', error);
    return false;
  }
};

/**
 * Calculate distance between two points using Haversine formula
 * @param {Number} lat1 First latitude
 * @param {Number} lon1 First longitude
 * @param {Number} lat2 Second latitude
 * @param {Number} lon2 Second longitude
 * @returns {Number} Distance in kilometers
 */
exports.getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return null;
  }
  
  try {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; // Distance in km
    return d;
  } catch (error) {
    console.error('Error calculating distance:', error);
    return null;
  }
};

/**
 * Convert degrees to radians
 * @param {Number} deg Degrees
 * @returns {Number} Radians
 */
exports.deg2rad = (deg) => {
  return deg * (Math.PI/180);
};

/**
 * Check if same day for streaks
 * @param {Date} date1 First date
 * @param {Date} date2 Second date
 * @returns {Boolean} Same day status
 */
exports.isSameDay = (date1, date2) => {
  return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
};

/**
 * Get day difference between two dates
 * @param {Date} date1 First date
 * @param {Date} date2 Second date
 * @returns {Number} Day difference
 */
exports.getDayDifference = (date1, date2) => {
  const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
  const diffDays = Math.round(Math.abs((date1 - date2) / oneDay));
  return diffDays;
};

/**
 * Check if a day is valid for a streak
 * @param {Number} dayDiff Day difference
 * @param {String} target Target frequency
 * @param {Object} customFrequency Custom frequency settings
 * @returns {Boolean} Valid streak day status
 */
exports.isValidStreakDay = (dayDiff, target, customFrequency) => {
  switch (target) {
    case 'daily':
      return dayDiff === 1;
    case 'weekly':
      return dayDiff <= 7;
    case 'custom':
      // For custom frequency, check if days per week matches
      if (customFrequency && customFrequency.daysPerWeek) {
        return dayDiff <= (7 / customFrequency.daysPerWeek);
      }
      return false;
    default:
      return false;
  }
};

/**
 * Generate a random string
 * @param {Number} length Length of string
 * @returns {String} Random string
 */
exports.generateRandomString = (length = 10) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

/**
 * Parse JSON safely
 * @param {String} str String to parse
 * @param {*} defaultValue Default value if parsing fails
 * @returns {*} Parsed value or default
 */
exports.safeParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    return defaultValue;
  }
};

/**
 * Format profile view analytics
 * @param {Array} history View history
 * @param {String} period Period (day, week, month, year)
 * @returns {Object} Formatted analytics
 */
exports.formatProfileViewAnalytics = (history, period = 'month') => {
  const now = new Date();
  let startDate;
  
  switch(period) {
    case 'day':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case 'year':
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
  }
  
  // Filter history for current period
  const filteredHistory = history
    .filter(entry => new Date(entry.date) >= startDate && new Date(entry.date) <= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Calculate total views
  const totalViews = filteredHistory.reduce((sum, entry) => sum + entry.count, 0);
  
  return {
    totalViews,
    history: filteredHistory,
    startDate,
    endDate: now
  };
};

/**
 * Check if URL is valid
 * @param {String} url URL to check
 * @returns {Boolean} Valid URL status
 */
exports.isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = exports;