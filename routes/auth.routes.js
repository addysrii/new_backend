const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const authController = require('../controllers/auth.controller.js');
const { authenticateToken } = require('../middleware/auth.middleware.js');

// Helper function to encode state with redirectTo
const encodeStateWithRedirect = (redirectTo) => {
  const stateData = {
    random: crypto.randomBytes(16).toString('hex'),
    redirectTo: redirectTo || null
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

// Google authentication
router.get('/google', (req, res, next) => {
  // Store redirectTo in state parameter if provided
  const state = encodeStateWithRedirect(req.query.redirectTo);
  
  // Store state in cookie for verification on callback
  res.cookie('google_oauth_state', state, { 
    httpOnly: true, 
    maxAge: 10 * 60 * 1000 // 10 minutes
  });
  
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    state
  })(req, res, next);
});

router.get('/google/callback', 
  // Middleware to verify state and extract redirectTo
  (req, res, next) => {
    const cookieState = req.cookies.google_oauth_state;
    const queryState = req.query.state;
    
    if (!cookieState || !queryState || cookieState !== queryState) {
      return res.redirect('/login?error=invalid_state');
    }
    
    // Extract redirectTo from state
    try {
      const stateData = JSON.parse(Buffer.from(queryState, 'base64').toString());
      if (stateData.redirectTo) {
        req.redirectTo = stateData.redirectTo;
      }
    } catch (error) {
      console.error('Error parsing state:', error);
    }
    
    // Clear the state cookie
    res.clearCookie('google_oauth_state');
    next();
  },
  passport.authenticate('google', { 
    session: false, 
    failureRedirect: '/login?error=auth_failed' 
  }),
  authController.googleCallback
);

// LinkedIn authentication
router.get('/linkedin', (req, res) => {
  try {
    // Store redirectTo in state parameter if provided
    const state = encodeStateWithRedirect(req.query.redirectTo);
    
    // Store state in cookie for validation on callback
    res.cookie('linkedin_oauth_state', state, { 
      httpOnly: true, 
      maxAge: 10 * 60 * 1000 // 10 minutes
    });
    
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
      `response_type=code&` +
      `client_id=${process.env.LINKEDIN_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(`${process.env.BASE_URL}/auth/linkedin/callback`)}&` +
      `state=${state}&` +
      `scope=r_liteprofile,r_emailaddress`;
    
    res.redirect(authUrl);
  } catch (error) {
    console.error('LinkedIn redirect error:', error);
    res.redirect('/login?error=linkedin_redirect_failed');
  }
});

router.get('/linkedin/callback', authController.linkedinCallback);

module.exports = router;