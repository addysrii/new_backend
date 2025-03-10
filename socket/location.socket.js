// socket/location.socket.js
const User = require('../models/user/user.js');
const locationService = require('../services/location.service.js');
const mongoose = require('mongoose');

/**
 * Location socket handler
 * @param {Object} io Socket.io instance
 * @param {Object} socket Socket instance
 */
module.exports = (io, socket) => {
  // Update user location
  socket.on('location:update', async (data) => {
    try {
      const { coordinates } = data;
      
      if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
        return socket.emit('error', { message: 'Invalid coordinates' });
      }
      
      const [longitude, latitude] = coordinates;
      
      // Validate coordinates
      if (!locationService.validateCoordinates(latitude, longitude)) {
        return socket.emit('error', { message: 'Invalid coordinates' });
      }
      
      // Update user location
      await User.findByIdAndUpdate(socket.userId, {
        'location.type': 'Point',
        'location.coordinates': [longitude, latitude],
        'location.lastUpdated': new Date()
      });
      
      socket.emit('location:updated', {
        coordinates: [longitude, latitude]
      });
    } catch (error) {
      console.error('Update location error:', error);
      socket.emit('error', { message: 'Error updating location' });
    }
  });
  
  // Get nearby users
  socket.on('location:nearby', async (data) => {
    try {
      const { coordinates, maxDistance = 5000, limit = 20 } = data;
      
      if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
        return socket.emit('error', { message: 'Invalid coordinates' });
      }
      
      const [longitude, latitude] = coordinates;
      
      // Validate coordinates
      if (!locationService.validateCoordinates(latitude, longitude)) {
        return socket.emit('error', { message: 'Invalid coordinates' });
      }
      
      // Find nearby users
      const nearbyUsers = await User.find({
        _id: { $ne: socket.userId },
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: maxDistance // meters
          }
        },
        // Only show users with appropriate privacy settings
        'privacy.locationSharing': { $in: ['everyone', 'connections'] }
      })
        .select('firstName lastName profilePicture headline location')
        .limit(limit);
      
      // Filter users based on connection status
      const currentUser = await User.findById(socket.userId).select('connections');
      
      const filteredUsers = nearbyUsers.filter(user => {
        // If user only shares location with connections, check if connected
        if (user.privacy?.locationSharing === 'connections') {
          return currentUser.connections?.includes(user._id);
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
            latitude, longitude, userCoords[1], userCoords[0]
          );
          
          userObj.distance = distance;
        }
        
        return userObj;
      });
      
      socket.emit('location:nearby', {
        users: usersWithDistance
      });
    } catch (error) {
      console.error('Get nearby users error:', error);
      socket.emit('error', { message: 'Error getting nearby users' });
    }
  });
  
  // Share location with a user
  socket.on('location:share', async (data) => {
    try {
      const { userId, coordinates, duration = 60 } = data; // duration in minutes
      
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return socket.emit('error', { message: 'Invalid user ID' });
      }
      
      if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
        return socket.emit('error', { message: 'Invalid coordinates' });
      }
      
      const [longitude, latitude] = coordinates;
      
      // Validate coordinates
      if (!locationService.validateCoordinates(latitude, longitude)) {
        return socket.emit('error', { message: 'Invalid coordinates' });
      }
      
      // Check if target user exists
      const targetUser = await User.findById(userId);
      
      if (!targetUser) {
        return socket.emit('error', { message: 'User not found' });
      }
      
      // Get current user data
      const currentUser = await User.findById(socket.userId)
        .select('firstName lastName profilePicture');
      
      // Create expiration time
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + duration);
      
      // Create location share data
      const locationShare = {
        userId: socket.userId,
        userName: `${currentUser.firstName} ${currentUser.lastName}`,
        profilePicture: currentUser.profilePicture,
        coordinates: [longitude, latitude],
        sharedAt: new Date(),
        expiresAt
      };
      
      // Emit to target user
      io.to(`user:${userId}`).emit('location:shared', {
        ...locationShare
      });
      
      // Emit notification
      io.to(`user:${userId}`).emit('notification:new', {
        type: 'location_sharing',
        sender: {
          _id: socket.userId,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          profilePicture: currentUser.profilePicture
        },
        message: `shared their location with you`,
        duration,
        coordinates: [longitude, latitude]
      });
      
      socket.emit('location:share-success', {
        userId,
        expiresAt
      });
    } catch (error) {
      console.error('Share location error:', error);
      socket.emit('error', { message: 'Error sharing location' });
    }
  });
};