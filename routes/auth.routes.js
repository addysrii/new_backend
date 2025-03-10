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

// Debugging endpoint to verify configuration
router.get('/google-debug', (req, res) => {
  res.json({
    googleConfigured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    callbackUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
  });
});

// FIXED Google authentication route - proper middleware usage
router.get('/google', (req, res) => {
  // Store the intended redirect destination if provided
  const redirectTo = req.query.redirectTo || '/dashboard';
  console.log(`Google auth redirect with redirectTo: ${redirectTo}`);
  
  // Create a state parameter with redirect info
  const state = encodeStateWithRedirect(redirectTo);
  
  // Use passport authenticate as a middleware that handles the request
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    state
  })(req, res);
});

// FIXED Google callback route - proper middleware chain
router.get('/google/callback', 
  passport.authenticate('google', { 
    session: false, 
    failureRedirect: `${FRONTEND_URL}/login?error=auth_failed` 
  }),
  authController.googleCallback
);

// LinkedIn authentication routes - if still needed, similar fix would apply
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  router.get('/linkedin', authController.linkedinRedirect);
  router.get('/linkedin/callback', authController.linkedinCallback);
}

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
