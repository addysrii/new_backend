// routes/user.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller.js');
const { authenticateToken, rateLimiter } = require('../middleware/auth.middleware.js');
const fileUploadService = require('../services/file-upload.service.js');
const { validateRequest, profileValidationRules } = require('../middleware/validation.middleware.js');
const User= require('../models/user/user.js')
// Search and get users

router.get('/me', authenticateToken, async (req, res) => {
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


module.exports = router;
