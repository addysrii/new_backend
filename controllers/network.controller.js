// controllers/network.controller.js
const User = require('../models/user/user.js');
const mongoose = require('mongoose');
const locationService = require('../services/location.service.js');

/**
 * @route   GET /api/network/nearby
 * @desc    Get nearby professionals
 * @access  Private
 */
exports.getNearbyProfessionals = async (req, res) => {
  try {
    const { distance = 10, latitude, longitude } = req.query;
    
    // Validate coordinates
    if (!latitude || !longitude || !locationService.validateCoordinates(parseFloat(latitude), parseFloat(longitude))) {
      return res.status(400).json({
        success: false,
        error: 'Valid coordinates are required'
      });
    }
    
    // Convert to numbers
    const maxDistance = parseFloat(distance) * 1000; // Convert kilometers to meters
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    
    // Find nearby users with privacy filter
    const nearbyUsers = await User.find({
      _id: { $ne: req.user.id }, // Exclude current user
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lon, lat] // MongoDB uses [longitude, latitude] order
          },
          $maxDistance: maxDistance
        }
      },
      'privacy.locationSharing': { $in: ['everyone', 'connections'] }
    })
    .select('firstName lastName headline profilePicture industry location connections')
    .limit(50);
    
    // Filter based on connection status
    const currentUser = await User.findById(req.user.id).select('connections');
    
    const filteredUsers = nearbyUsers.filter(user => {
      // If user only shares location with connections, check if connected
      if (user.privacy?.locationSharing === 'connections') {
        return currentUser.connections.includes(user._id);
      }
      
      // Otherwise (public sharing), include user
      return true;
    });
    
    // Calculate distance for each user
    const usersWithDistance = filteredUsers.map(user => {
      const userObj = user.toObject();
      
      if (user.location?.coordinates?.length === 2) {
        const userCoords = user.location.coordinates;
        const distance = locationService.getDistanceFromLatLonInKm(
          lat, lon, userCoords[1], userCoords[0]
        );
        
        userObj.distance = distance;
      }
      
      // Add connection status
      userObj.isConnected = currentUser.connections.some(
        conn => conn.toString() === user._id.toString()
      );
      
      return userObj;
    });
    
    // Sort by distance
    usersWithDistance.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
    
    res.json(usersWithDistance);
  } catch (error) {
    console.error('Get nearby professionals error:', error);
    res.status(500).json({
      success: false,
      error: 'Error finding nearby professionals'
    });
  }
};

/**
 * @route   GET /api/network/connections
 * @desc    Get user connections
 * @access  Private
 */
exports.getConnections = async (req, res) => {
  try {
    const { type = 'all', search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    const query = {
      _id: { $ne: req.user.id } // Exclude current user
    };
    
    // Add search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { headline: searchRegex },
        { 'portfolio.about': searchRegex }
      ];
    }
    
    // Get user for connection list
    const user = await User.findById(req.user.id).select('connections pendingConnections');
    
    // Filter by connection type
    if (type === 'connected') {
      query._id = { $in: user.connections };
    } else if (type === 'pending') {
      query._id = { $in: user.pendingConnections };
    }
    
    // Execute query
    const connections = await User.find(query)
      .select('firstName lastName headline profilePicture industry location online lastActive connections')
      .sort({ firstName: 1, lastName: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await User.countDocuments(query);
    
    // Add connection status
    const connectionsWithStatus = connections.map(conn => {
      const connObj = conn.toObject();
      
      // Check connection status
      connObj.connectionStatus = user.connections.includes(conn._id) 
        ? 'connected' 
        : user.pendingConnections.includes(conn._id) 
          ? 'pending' 
          : 'none';
      
      return connObj;
    });
    
    res.json({
      connections: connectionsWithStatus,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
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
 * @route   POST /api/network/connection-request
 * @desc    Send connection request
 * @access  Private
 */
exports.sendConnectionRequest = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    
    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid target user ID is required'
      });
    }
    
    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Target user not found'
      });
    }
    
    // Get current user
    const currentUser = await User.findById(req.user.id);
    
    // Check if already connected
    if (currentUser.connections.includes(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Already connected with this user'
      });
    }
    
    // Check if request is already pending
    if (targetUser.pendingConnections.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        error: 'Connection request already pending'
      });
    }
    
    // Add current user to target user's pending connections
    targetUser.pendingConnections.push(req.user.id);
    await targetUser.save();
    
    // Create notification for target user
    // In a real app, would use a notification service
    
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
 * @route   POST /api/network/connection-response
 * @desc    Accept or decline connection request
 * @access  Private
 */
exports.respondToConnectionRequest = async (req, res) => {
  try {
    const { senderUserId, action } = req.body;
    
    if (!senderUserId || !mongoose.Types.ObjectId.isValid(senderUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid sender user ID is required'
      });
    }
    
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action must be "accept" or "decline"'
      });
    }
    
    // Check if sender user exists
    const senderUser = await User.findById(senderUserId);
    
    if (!senderUser) {
      return res.status(404).json({
        success: false,
        error: 'Sender user not found'
      });
    }
    
    // Get current user
    const currentUser = await User.findById(req.user.id);
    
    // Check if request exists
    if (!currentUser.pendingConnections.includes(senderUserId)) {
      return res.status(400).json({
        success: false,
        error: 'No pending connection request from this user'
      });
    }
    
    // Remove from pending connections
    currentUser.pendingConnections = currentUser.pendingConnections.filter(
      id => id.toString() !== senderUserId
    );
    
    if (action === 'accept') {
      // Add to connections for both users
      currentUser.connections.push(senderUserId);
      senderUser.connections.push(req.user.id);
      
      // Create notification for sender
      // In a real app, would use a notification service
    }
    
    await currentUser.save();
    await senderUser.save();
    
    res.json({
      success: true,
      message: action === 'accept' ? 'Connection accepted' : 'Connection declined'
    });
  } catch (error) {
    console.error('Connection response error:', error);
    res.status(500).json({
      success: false,
      error: 'Error processing connection response'
    });
  }
};

/**
 * @route   GET /api/network/connection-requests
 * @desc    Get pending connection requests
 * @access  Private
 */
exports.getConnectionRequests = async (req, res) => {
  try {
    // Get current user with pending connections
    const currentUser = await User.findById(req.user.id).select('pendingConnections');
    
    if (!currentUser.pendingConnections || currentUser.pendingConnections.length === 0) {
      return res.json([]);
    }
    
    // Get user details for pending connections
    const pendingRequests = await User.find({
      _id: { $in: currentUser.pendingConnections }
    }).select('firstName lastName headline profilePicture industry createdAt');
    
    res.json(pendingRequests);
  } catch (error) {
    console.error('Get connection requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching connection requests'
    });
  }
};

/**
 * @route   POST /api/network/remove-connection
 * @desc    Remove a connection
 * @access  Private
 */
exports.removeConnection = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID is required'
      });
    }
    
    // Get both users
    const currentUser = await User.findById(req.user.id);
    const otherUser = await User.findById(userId);
    
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if connected
    if (!currentUser.connections.includes(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Not connected with this user'
      });
    }
    
    // Remove from both users' connections
    currentUser.connections = currentUser.connections.filter(
      id => id.toString() !== userId
    );
    
    otherUser.connections = otherUser.connections.filter(
      id => id.toString() !== req.user.id
    );
    
    await currentUser.save();
    await otherUser.save();
    
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

module.exports = exports;
