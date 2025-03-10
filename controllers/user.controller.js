// controllers/user.controller.js
const User = require('../models/user/user.js');
const profileViewService = require('../services/profile-view.service.js');
const fileUploadService = require('../services/file-upload.service.js');
const mongoose = require('mongoose');

/**
 * @route   GET /api/users
 * @desc    Search users with pagination and filters
 * @access  Private
 */
exports.searchUsers = async (req, res) => {
  try {
    const {
      query,
      skills,
      location,
      industry,
      limit = 10,
      page = 1,
      sort = 'name'
    } = req.query;
    
    // Build search query
    let searchQuery = {};
    
    // Text search (first name, last name, headline)
    if (query) {
      searchQuery.$or = [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { headline: { $regex: query, $options: 'i' } }
      ];
    }
    
    // Skills filter
    if (skills) {
      const skillsList = skills.split(',').map(skill => skill.trim());
      searchQuery['skills.name'] = { $in: skillsList };
    }
    
    // Industry filter
    if (industry) {
      searchQuery.industry = { $regex: industry, $options: 'i' };
    }
    
    // Location-based filtering
    if (location) {
      // If coordinates are provided
      if (location.lat && location.lng) {
        searchQuery.location = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(location.lng), parseFloat(location.lat)]
            },
            $maxDistance: parseInt(location.radius) || 50000 // Default 50km
          }
        };
      } else {
        // Text-based location search
        searchQuery['portfolio.location'] = { $regex: location, $options: 'i' };
      }
    }
    
    // Skip blocked users
    searchQuery._id = { $nin: req.user.blockedUsers || [] };
    
    // Include only users with appropriate privacy settings
    searchQuery.$or = searchQuery.$or || [];
    searchQuery.$or.push(
      { 'privacy.profileVisibility': 'public' },
      { 'privacy.profileVisibility': 'connections', connections: req.user.id },
      { 'privacy.profileVisibility': 'followers', followers: req.user.id },
      { _id: req.user.id } // Always include current user
    );
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Determine sort order
    let sortOption = { firstName: 1, lastName: 1 }; // Default sort
    
    switch (sort) {
      case 'recent':
        sortOption = { createdAt: -1 };
        break;
      case 'popular':
        sortOption = { 'analytics.profileViews.count': -1 };
        break;
      case 'connections':
        sortOption = { 'connections.length': -1 };
        break;
    }
    
    // Execute query
    const users = await User.find(searchQuery)
      .select('firstName lastName profilePicture headline industry location online lastActive skills connections followers')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await User.countDocuments(searchQuery);
    
    // Enhance user data with connection status
    const enhancedUsers = users.map(user => {
      const userObj = user.toObject();
      
      // Check connection status
      userObj.connectionStatus = 'none';
      
      if (user._id.toString() === req.user.id) {
        userObj.connectionStatus = 'self';
      } else if (user.connections && user.connections.some(c => c.toString() === req.user.id)) {
        userObj.connectionStatus = 'connected';
      } else if (user.pendingConnections && user.pendingConnections.some(c => c.toString() === req.user.id)) {
        userObj.connectionStatus = 'pending';
      }
      
      // Check follow status
      userObj.isFollowing = user.followers && user.followers.some(f => f.toString() === req.user.id);
      
      return userObj;
    });
    
    res.json({
      success: true,
      users: enhancedUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      error: 'Error searching users'
    });
  }
};

/**
 * @route   GET /api/users/:id
 * @desc    Get user profile by ID
 * @access  Private
 */
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Find user
    const user = await User.findById(userId)
      .select('-password -deviceTokens -security -restrictedUsers -blockedUsers')
      .populate('connections', 'firstName lastName profilePicture headline')
      .populate('followers', 'firstName lastName profilePicture headline');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user is blocked
    if (user.blockedUsers && user.blockedUsers.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'You cannot view this profile'
      });
    }
    
    // Check privacy settings
    if (userId !== req.user.id) {
      // Handle restricted profile visibility
      if (user.privacy && user.privacy.profileVisibility === 'private') {
        return res.status(403).json({
          success: false,
          error: 'This profile is private'
        });
      }
      
      if (user.privacy && user.privacy.profileVisibility === 'connections' &&
          (!user.connections || !user.connections.some(c => c.toString() === req.user.id))) {
        return res.status(403).json({
          success: false,
          error: 'You must be connected to view this profile'
        });
      }
      
      if (user.privacy && user.privacy.profileVisibility === 'followers' &&
          (!user.followers || !user.followers.some(f => f.toString() === req.user.id))) {
        return res.status(403).json({
          success: false,
          error: 'You must be following to view this profile'
        });
      }
      
      // Track profile view if not own profile
      await profileViewService.trackProfileView(userId, req.user.id);
    }
    
    // Check connection status
    const connectionStatus = user._id.toString() === req.user.id 
      ? 'self'
      : user.connections && user.connections.some(c => c.toString() === req.user.id)
        ? 'connected'
        : user.pendingConnections && user.pendingConnections.some(c => c.toString() === req.user.id)
          ? 'pending'
          : 'none';
    
    // Check follow status
    const isFollowing = user.followers && user.followers.some(f => f.toString() === req.user.id);
    
    // Create response
    const userProfile = {
      ...user.toObject(),
      connectionStatus,
      isFollowing
    };
    
    res.json({
      success: true,
      user: userProfile
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching user profile'
    });
  }
};

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
exports.updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      headline,
      industry,
      portfolio,
      privacy
    } = req.body;
    
    // Find user
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Update basic info
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (headline) user.headline = headline;
    if (industry) user.industry = industry;
    
    // Update portfolio data
    if (portfolio) {
      user.portfolio = {
        ...user.portfolio || {},
        ...portfolio
      };
    }
    
    // Update privacy settings
    if (privacy) {
      user.privacy = {
        ...user.privacy || {},
        ...privacy
      };
    }
    
    // Save updated user
    await user.save();
    
    // Return updated profile
    const updatedUser = await User.findById(req.user.id)
      .select('-password -deviceTokens -security -restrictedUsers -blockedUsers');
    
    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating profile'
    });
  }
};

/**
 * @route   POST /api/users/profile-picture
 * @desc    Upload profile picture
 * @access  Private
 */
exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    // Upload image to Cloudinary
    const uploadResult = await fileUploadService.uploadFile(
      req.file,
      'profile_pictures',
      {
        transformation: [
          { width: 500, height: 500, crop: 'fill' },
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      }
    );
    
    // Update user profile
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePicture: uploadResult.url },
      { new: true }
    ).select('-password -deviceTokens -security');
    
    res.json({
      success: true,
      profilePicture: uploadResult.url,
      user
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({
      success: false,
      error: 'Error uploading profile picture'
    });
  }
};

/**
 * @route   POST /api/users/connect/:id
 * @desc    Send connection request
 * @access  Private
 */
exports.sendConnectionRequest = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Prevent self-connection
    if (targetUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot connect with yourself'
      });
    }
    
    // Find target user
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if users are already connected
    if (targetUser.connections && targetUser.connections.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        error: 'Already connected with this user'
      });
    }
    
    // Check if request is already pending
    if (targetUser.pendingConnections && targetUser.pendingConnections.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        error: 'Connection request already sent'
      });
    }
    
    // Check if user is blocked
    if (targetUser.blockedUsers && targetUser.blockedUsers.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'Cannot send connection request'
      });
    }
    
    // Add to pending connections
    await User.findByIdAndUpdate(targetUserId, {
      $addToSet: { pendingConnections: req.user.id }
    });
    
    // Create notification
    const notificationService = require('../services/notification.service');
    await notificationService.createNotification({
      recipient: targetUserId,
      sender: req.user.id,
      type: 'connection_request',
      contentType: 'user',
      contentId: req.user.id,
      text: 'sent you a connection request',
      actionUrl: `/profile/${req.user.id}`
    });
    
    res.json({
      success: true,
      message: 'Connection request sent'
    });
  } catch (error) {
    console.error('Send connection request error:', error);
    res.status(500).json({
      success: false,
      error: 'Error sending connection request'
    });
  }
};

/**
 * @route   POST /api/users/connect/respond/:id
 * @desc    Respond to connection request
 * @access  Private
 */
exports.respondToConnectionRequest = async (req, res) => {
  try {
    const { id: senderUserId } = req.params;
    const { accept } = req.body;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(senderUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Find current user
    const currentUser = await User.findById(req.user.id);
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if request exists
    if (!currentUser.pendingConnections || !currentUser.pendingConnections.includes(senderUserId)) {
      return res.status(400).json({
        success: false,
        error: 'No pending connection request from this user'
      });
    }
    
    // Create notification service
    const notificationService = require('../services/notification.service');
    
    // Handle acceptance/rejection
    if (accept) {
      // Add to connections for both users
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { pendingConnections: senderUserId },
        $addToSet: { connections: senderUserId }
      });
      
      await User.findByIdAndUpdate(senderUserId, {
        $addToSet: { connections: req.user.id }
      });
      
      // Notify the other user
      await notificationService.createNotification({
        recipient: senderUserId,
        sender: req.user.id,
        type: 'connection_accepted',
        contentType: 'user',
        contentId: req.user.id,
        text: 'accepted your connection request',
        actionUrl: `/profile/${req.user.id}`
      });
      
      res.json({
        success: true,
        message: 'Connection request accepted'
      });
    } else {
      // Remove from pending connections
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { pendingConnections: senderUserId }
      });
      
      res.json({
        success: true,
        message: 'Connection request declined'
      });
    }
  } catch (error) {
    console.error('Respond to connection request error:', error);
    res.status(500).json({
      success: false,
      error: 'Error responding to connection request'
    });
  }
};

/**
 * @route   DELETE /api/users/connect/:id
 * @desc    Remove connection
 * @access  Private
 */
exports.removeConnection = async (req, res) => {
  try {
    const { id: connectionUserId } = req.params;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(connectionUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Remove connection for both users
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { connections: connectionUserId }
    });
    
    await User.findByIdAndUpdate(connectionUserId, {
      $pull: { connections: req.user.id }
    });
    
    res.json({
      success: true,
      message: 'Connection removed'
    });
  } catch (error) {
    console.error('Remove connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Error removing connection'
    });
  }
};

/**
 * @route   POST /api/users/follow/:id
 * @desc    Follow a user
 * @access  Private
 */
exports.followUser = async (req, res) => {
  try {
    const { id: targetUserId } = req.params;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Prevent self-follow
    if (targetUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot follow yourself'
      });
    }
    
    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user is blocked
    if (targetUser.blockedUsers && targetUser.blockedUsers.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'Cannot follow this user'
      });
    }
    
    // Add to followers for target user and following for current user
    await User.findByIdAndUpdate(targetUserId, {
      $addToSet: { followers: req.user.id }
    });
    
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { following: targetUserId }
    });
    
    // Create notification
    const notificationService = require('../services/notification.service');
    await notificationService.createNotification({
      recipient: targetUserId,
      sender: req.user.id,
      type: 'follow',
      contentType: 'user',
      contentId: req.user.id,
      text: 'started following you',
      actionUrl: `/profile/${req.user.id}`
    });
    
    res.json({
      success: true,
      message: 'Now following user'
    });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({
      success: false,
      error: 'Error following user'
    });
  }
};

/**
 * @route   DELETE /api/users/follow/:id
 * @desc    Unfollow a user
 * @access  Private
 */
exports.unfollowUser = async (req, res) => {
  try {
    const { id: targetUserId } = req.params;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Remove from followers and following lists
    await User.findByIdAndUpdate(targetUserId, {
      $pull: { followers: req.user.id }
    });
    
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { following: targetUserId }
    });
    
    res.json({
      success: true,
      message: 'Unfollowed user'
    });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({
      success: false,
      error: 'Error unfollowing user'
    });
  }
};

/**
 * @route   POST /api/users/block/:id
 * @desc    Block a user
 * @access  Private
 */
exports.blockUser = async (req, res) => {
  try {
    const { id: targetUserId } = req.params;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Prevent self-block
    if (targetUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot block yourself'
      });
    }
    
    // Update current user (add to blocked)
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { blockedUsers: targetUserId },
      
      // Also remove any connections and follows
      $pull: { 
        connections: targetUserId,
        pendingConnections: targetUserId,
        following: targetUserId,
        followers: targetUserId
      }
    });
    
    // Update target user (remove connections and follows)
    await User.findByIdAndUpdate(targetUserId, {
      $pull: {
        connections: req.user.id,
        pendingConnections: req.user.id,
        following: req.user.id,
        followers: req.user.id
      }
    });
    
    res.json({
      success: true,
      message: 'User blocked'
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({
      success: false,
      error: 'Error blocking user'
    });
  }
};

/**
 * @route   DELETE /api/users/block/:id
 * @desc    Unblock a user
 * @access  Private
 */
exports.unblockUser = async (req, res) => {
  try {
    const { id: targetUserId } = req.params;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Update current user
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { blockedUsers: targetUserId }
    });
    
    res.json({
      success: true,
      message: 'User unblocked'
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({
      success: false,
      error: 'Error unblocking user'
    });
  }
};

/**
 * @route   GET /api/users/connections
 * @desc    Get user connections
 * @access  Private
 */
exports.getUserConnections = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    
    // Find user with populated connections
    const user = await User.findById(req.user.id)
      .select('connections')
      .populate({
        path: 'connections',
        select: 'firstName lastName profilePicture headline industry online lastActive',
        options: {
          limit: parseInt(limit),
          skip: (parseInt(page) - 1) * parseInt(limit)
        }
      });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Get total count
    const connectionsCount = user.connections ? user.connections.length : 0;
    
    res.json({
      success: true,
      connections: user.connections,
      pagination: {
        total: connectionsCount,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(connectionsCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching connections'
    });
  }
};

/**
 * @route   GET /api/users/recommendations
 * @desc    Get user recommendations
 * @access  Private
 */
exports.getUserRecommendations = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Get current user
    const currentUser = await User.findById(req.user.id)
      .select('industry skills connections blockedUsers following');
    
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Build excluded users list (connections, blocked, self)
    const excludedUsers = [
      req.user.id,
      ...(currentUser.connections || []).map(id => id.toString()),
      ...(currentUser.blockedUsers || []).map(id => id.toString()),
      ...(currentUser.following || []).map(id => id.toString())
    ];
    
    // Build recommendation query
    const query = {
      _id: { $nin: excludedUsers },
      'privacy.profileVisibility': { $ne: 'private' }
    };
    
    // Prioritize same industry if available
    if (currentUser.industry) {
      query.industry = currentUser.industry;
    }
    
    // Find users with similar skills or industry
    const recommendations = await User.find(query)
      .select('firstName lastName profilePicture headline industry')
      .limit(parseInt(limit));
    
    // If not enough recommendations, find more without industry filter
    if (recommendations.length < parseInt(limit) && currentUser.industry) {
      const additionalCount = parseInt(limit) - recommendations.length;
      
      if (additionalCount > 0) {
        const additionalQuery = {
          _id: { $nin: [...excludedUsers, ...recommendations.map(r => r._id)] },
          'privacy.profileVisibility': { $ne: 'private' }
        };
        
        const additionalRecommendations = await User.find(additionalQuery)
          .select('firstName lastName profilePicture headline industry')
          .limit(additionalCount);
        
        recommendations.push(...additionalRecommendations);
      }
    }
    
    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching recommendations'
    });
  }
};

/**
 * @route   GET /api/users/pending-connections
 * @desc    Get pending connection requests
 * @access  Private
 */
exports.getPendingConnections = async (req, res) => {
  try {
    // Find user with populated pending connections
    const user = await User.findById(req.user.id)
      .select('pendingConnections')
      .populate('pendingConnections', 'firstName lastName profilePicture headline industry');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      pendingConnections: user.pendingConnections || []
    });
  } catch (error) {
    console.error('Get pending connections error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching pending connections'
    });
  }
};

module.exports = exports;