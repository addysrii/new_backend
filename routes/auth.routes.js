const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authController = require('../controllers/auth.controller.js');
const { authenticateToken } = require('../middleware/auth.middleware.js');

// Environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

// Helper function to encode state with redirectTo
const encodeStateWithRedirect = (redirectTo) => {
  const stateData = {
    random: crypto.randomBytes(16).toString('hex'),
    redirectTo: redirectTo || '/dashboard',
    timestamp: Date.now()
  };
  return Buffer.from(JSON.stringify(stateData)).toString('base64');
};

// Standard auth routes
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/logout', authenticateToken, authController.logout);
router.get('/me', authenticateToken, authController.getCurrentUser);
router.post('/check-provider', authController.checkAuthProvider);

// Phone authentication
router.post('/phone/send-code', authController.sendPhoneCode);
router.post('/phone/verify', authController.verifyPhone);

// Two-factor authentication
router.post('/2fa/setup', authenticateToken, authController.setupTwoFactor);

// LinkedIn authentication routes
router.get('/linkedin', (req, res) => {
  // Store the intended redirect destination if provided
  const redirectTo = req.query.redirectTo || '/dashboard';
  console.log(`LinkedIn auth redirect with redirectTo: ${redirectTo}`);
  
  // Use LinkedIn redirect function from controller
  authController.linkedinRedirect(req, res);
});

router.get('/linkedin/callback', authController.linkedinCallback);

// Google authentication routes
router.get('/google', (req, res) => {
  // Store the intended redirect destination if provided
  const redirectTo = req.query.redirectTo || '/dashboard';
  console.log(`Google auth redirect with redirectTo: ${redirectTo}`);
  
  // Create a state parameter with redirect info
  const state = encodeStateWithRedirect(redirectTo);
  
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    state
  })(req, res);
});

router.get('/google/callback',
  passport.authenticate('google', { 
    session: false, 
    failureRedirect: `${FRONTEND_URL}/login?error=auth_failed` 
  }),
  authController.googleCallback
);

// Auth callback helper - used by frontend to process tokens
router.get('/callback', (req, res) => {
  const { token, isNewUser, redirect } = req.query;
  
  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Token is required'
    });
  }
  
  try {
    // Verify the token is valid
    jwt.verify(token, JWT_SECRET);
    
    res.json({
      success: true,
      token,
      isNewUser: isNewUser === 'true',
      redirect: redirect || '/dashboard'
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

module.exports = router;
