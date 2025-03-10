// services/profile-view.service.js
const User = require('../models/user/user.js');
const ProfileView = require('../models/user/ProfileView.js');

/**
 * Service for handling user profile views and analytics
 */
class ProfileViewService {
  /**
   * Track a profile view
   * @param {string} profileUserId User ID of the profile being viewed
   * @param {string} viewerUserId User ID of the viewer
   * @returns {Promise<Boolean>} Success status
   */
  async trackProfileView(profileUserId, viewerUserId) {
    try {
      // Don't track if viewing own profile
      if (profileUserId === viewerUserId) {
        return false;
      }
      
      // Check if already viewed recently (last 24 hours)
      const existingView = await ProfileView.findOne({
        profileUser: profileUserId,
        viewerUser: viewerUserId,
        viewedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      
      if (existingView) {
        // Update last view time
        existingView.viewedAt = new Date();
        await existingView.save();
        return false; // Not counted as a new view
      }
      
      // Create new profile view
      await ProfileView.create({
        profileUser: profileUserId,
        viewerUser: viewerUserId,
        viewedAt: new Date()
      });
      
      // Update analytics for the profile owner
      const user = await User.findById(profileUserId);
      
      if (user) {
        // Initialize analytics if not exists
        if (!user.analytics) {
          user.analytics = {};
        }
        
        if (!user.analytics.profileViews) {
          user.analytics.profileViews = {
            count: 0,
            lastReset: new Date(),
            history: []
          };
        }
        
        // Increment view count
        user.analytics.profileViews.count += 1;
        
        // Add to history (monthly rollup)
        const now = new Date();
        const monthYear = `${now.getFullYear()}-${now.getMonth() + 1}`;
        
        const historyEntry = user.analytics.profileViews.history.find(
          entry => {
            const entryDate = new Date(entry.date);
            return `${entryDate.getFullYear()}-${entryDate.getMonth() + 1}` === monthYear;
          }
        );
        
        if (historyEntry) {
          historyEntry.count += 1;
        } else {
          user.analytics.profileViews.history.push({
            date: now,
            count: 1
          });
        }
        
        // Limit history size
        if (user.analytics.profileViews.history.length > 24) { // Keep 2 years of monthly data
          user.analytics.profileViews.history.sort((a, b) => 
            new Date(a.date) - new Date(b.date)
          );
          
          user.analytics.profileViews.history = user.analytics.profileViews.history.slice(-24);
        }
        
        await user.save();
      }
      
      return true;
    } catch (error) {
      console.error('Track profile view error:', error);
      return false;
    }
  }
  
  /**
   * Get profile viewers
   * @param {string} userId User ID
   * @param {object} options Query options
   * @returns {Promise<Array>} Profile viewers
   */
  async getProfileViewers(userId, options = {}) {
    try {
      const { limit = 10, page = 1, days = 30 } = options;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Find profile views
      const profileViews = await ProfileView.find({
        profileUser: userId,
        viewedAt: { $gte: startDate }
      })
        .sort({ viewedAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .populate('viewerUser', 'firstName lastName profilePicture headline');
      
      // Count total views
      const totalViews = await ProfileView.countDocuments({
        profileUser: userId,
        viewedAt: { $gte: startDate }
      });
      
      // Count unique viewers
      const uniqueViewers = await ProfileView.distinct('viewerUser', {
        profileUser: userId,
        viewedAt: { $gte: startDate }
      });
      
      return {
        profileViews,
        pagination: {
          total: totalViews,
          uniqueViewers: uniqueViewers.length,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalViews / parseInt(limit))
        }
      };
    } catch (error) {
      console.error('Get profile viewers error:', error);
      throw error;
    }
  }
  
  /**
   * Reset profile view count
   * @param {string} userId User ID
   * @returns {Promise<Boolean>} Success status
   */
  async resetProfileViewCount(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user || !user.analytics || !user.analytics.profileViews) {
        return false;
      }
      
      // Reset count and update last reset date
      user.analytics.profileViews.count = 0;
      user.analytics.profileViews.lastReset = new Date();
      
      await user.save();
      return true;
    } catch (error) {
      console.error('Reset profile view count error:', error);
      return false;
    }
  }
  
  /**
   * Get profile view analytics
   * @param {string} userId User ID
   * @param {object} options Query options
   * @returns {Promise<Object>} Profile view analytics
   */
  async getProfileViewAnalytics(userId, options = {}) {
    try {
      const { period = 'month' } = options;
      const user = await User.findById(userId);
      
      if (!user || !user.analytics || !user.analytics.profileViews) {
        return {
          totalViews: 0,
          history: [],
          period
        };
      }
      
      // Format view history based on period
      const now = new Date();
      let startDate;
      
      switch (period) {
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
      
      // Filter history entries by date
      const filteredHistory = user.analytics.profileViews.history
        .filter(entry => new Date(entry.date) >= startDate)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Calculate total views in the period
      const totalViewsInPeriod = filteredHistory.reduce(
        (sum, entry) => sum + entry.count, 0
      );
      
      return {
        totalViews: user.analytics.profileViews.count,
        periodViews: totalViewsInPeriod,
        history: filteredHistory,
        period,
        lastReset: user.analytics.profileViews.lastReset
      };
    } catch (error) {
      console.error('Get profile view analytics error:', error);
      throw error;
    }
  }
}

module.exports = new ProfileViewService();