// routes/user.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller.js');
const { authenticateToken, rateLimiter } = require('../middleware/auth.middleware.js');
const fileUploadService = require('../services/file-upload.service.js');
const { validateRequest, profileValidationRules } = require('../middleware/validation.middleware.js');
const User= require('../models/user/user.js')
// Search and get users

router.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -deviceTokens -security.twoFactorSecret -security.twoFactorBackupCodes');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user data error:', error);
    res.status(500).json({ error: 'Error fetching user data' });
  }
});

router.get('/', authenticateToken, userController.searchUsers);
router.get('/connections', authenticateToken, userController.getUserConnections);
router.get('/recommendations', authenticateToken, userController.getUserRecommendations);
router.get('/pending-connections', authenticateToken, userController.getPendingConnections);
router.get('/:id', authenticateToken, rateLimiter('profile'), userController.getUserProfile);

// User profile management
router.put('/profile', 
  authenticateToken, 
  profileValidationRules(), 
  validateRequest, 
  userController.updateProfile);

router.post('/profile-picture',
  authenticateToken,
  fileUploadService.profileUpload.single('profileImage'),
  userController.uploadProfilePicture);

// Connection management
router.post('/connect/:id', authenticateToken, userController.sendConnectionRequest);
router.post('/connect/respond/:id', authenticateToken, userController.respondToConnectionRequest);
router.delete('/connect/:id', authenticateToken, userController.removeConnection);

// Follow management
router.post('/follow/:id', authenticateToken, userController.followUser);
router.delete('/follow/:id', authenticateToken, userController.unfollowUser);

// Block management
router.post('/block/:id', authenticateToken, userController.blockUser);
router.delete('/block/:id', authenticateToken, userController.unblockUser);

module.exports = router;
