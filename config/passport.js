// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user/user');

// Environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CALLBACK_URL = `${BASE_URL}/auth/google/callback`;

module.exports = () => {
  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      console.error('Error deserializing user:', error);
      done(error, null);
    }
  });

  // Configure Google Strategy
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      passReqToCallback: true
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google auth profile:', {
          id: profile.id,
          emails: profile.emails ? profile.emails.length : 0,
          displayName: profile.displayName
        });

        // Extract profile info
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const firstName = profile.name ? profile.name.givenName : '';
        const lastName = profile.name ? profile.name.familyName : '';
        const profilePicture = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
        
        if (!email) {
          console.error('No email found in Google profile');
          return done(new Error('No email found in Google profile'), null);
        }

        // Check if user already exists
        let user = await User.findOne({ 
          $or: [
            { googleId: profile.id },
            { email: email.toLowerCase() }
          ] 
        });
        
        let isNewUser = false;

        if (!user) {
          console.log('Creating new user from Google auth');
          // Create new user
          user = new User({
            googleId: profile.id,
            email: email.toLowerCase(),
            firstName,
            lastName,
            profilePicture,
            authProvider: 'google',
            emailVerified: true, // Google verifies emails
            createdAt: new Date()
          });
          
          await user.save();
          isNewUser = true;
        } else if (!user.googleId) {
          console.log('Updating existing user with Google ID');
          // User exists but doesn't have Google ID yet
          user.googleId = profile.id;
          user.authProvider = 'google';
          
          // Update profile data if missing
          if (!user.firstName) user.firstName = firstName;
          if (!user.lastName) user.lastName = lastName;
          if (!user.profilePicture && profilePicture) user.profilePicture = profilePicture;
          
          await user.save();
        }
        
        // Mark if this is a new user (for redirect purposes)
        user.isNewUser = isNewUser;
        
        return done(null, user);
      } catch (error) {
        console.error('Error in Google Strategy:', error);
        return done(error, null);
      }
    }));
    
    console.log('Google authentication strategy configured');
  } else {
    console.warn('Google authentication not configured: Missing client ID or secret');
  }
};
