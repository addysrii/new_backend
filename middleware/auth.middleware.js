// middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user/user.js');

/**
 * Verify JWT token and authenticate user
 */
exports.authenticateToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Verify token
    jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret-key', async (err, decoded) => {
      if (err) {
        // Token expired or invalid
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: 'Token expired'
          });
        }
        
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }
      
      // Check if user exists
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Check if token is in active sessions
      if (user.security && user.security.activeLoginSessions) {
        const activeSession = user.security.activeLoginSessions.find(
          session => session.token === token
        );
        
        if (!activeSession) {
          return res.status(401).json({
            success: false,
            error: 'Session expired or revoked'
          });
        }
        
        // Check if session is expired
        if (activeSession.expiresAt < new Date()) {
          return res.status(401).json({
            success: false,
            error: 'Session expired'
          });
        }
        
        // Update last active time
        activeSession.lastActive = new Date();
        await user.save();
      }
      
      // Add user to request object
      req.user = {
        id: user._id,
        email: user.email
      };
      
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
};

/**
 * Check if user is resource owner
 * @param {string} model Model name
 * @param {string} paramField Parameter field name
 * @param {string} ownerField Owner field name in the model
 */
exports.isResourceOwner = (model, paramField = 'id', ownerField = 'author') => {
  return async (req, res, next) => {
    try {
      // Get resource ID from params
      const resourceId = req.params[paramField];
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: 'Resource ID not provided'
        });
      }
      
      // Load the model
      const Model = require(`../models/${model}`);
      
      // Find the resource
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found'
        });
      }
      
      // Check ownership
      if (resource[ownerField].toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to access this resource'
        });
      }
      
      // Add resource to request
      req.resource = resource;
      
      next();
    } catch (error) {
      console.error('Resource owner check error:', error);
      res.status(500).json({
        success: false,
        error: 'Error checking resource ownership'
      });
    }
  };
};

/**
 * Check if user has admin role
 */
exports.isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      success: false,
      error: 'Error checking admin status'
    });
  }
};

/**
 * Rate limiter middleware for specific routes
 */
exports.rateLimiter = (type = 'api') => {
  const rateLimiters = require('./rate-limit.middleware');
  
  switch (type) {
    case 'auth':
      return rateLimiters.authLimiter;
    case 'profile':
      return rateLimiters.profileViewLimiter;
    default:
      return rateLimiters.apiLimiter;
  }
};