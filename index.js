const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const passport = require('passport');
const path = require('path');
const http = require('http');
const LocalStrategy = require('passport-local').Strategy;
const { Server } = require('socket.io');
const session = require('express-session');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');
const { networkInterfaces } = require('os');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const twilio = require('twilio');
const { profile } = require('console');


// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  credentials: true
}));
// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const STREAMING_SERVER_URL = process.env.STREAMING_SERVER_URL;
const STREAMING_SECRET = process.env.STREAMING_SECRET;
const PAYMENT_GATEWAY_API_KEY = process.env.PAYMENT_GATEWAY_API_KEY;
const PAYMENT_GATEWAY_SECRET = process.env.PAYMENT_GATEWAY_SECRET;

// Cloudinary setup
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
app.use(express.json()); // Ensure this is enabled

// Auth provider credentials
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE = process.env.TWILIO_VERIFY_SERVICE;
const REDIRECT_URI = `${BASE_URL}/auth/linkedin/callback`;

// Initialize Twilio client
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  credentials: true
}));
app.use(bodyParser.json());

// Cloudinary storage setup for file uploads
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'app_uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'avi', 'pdf', 'doc', 'docx']
  }
});

const upload = multer({ storage: storage });
// First, define the storage
const dpStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'dp',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [
      { quality: 'auto' }, // Automatic quality optimization
      { fetch_format: 'auto' }  // Automatic format conversion based on browser
    ]
  }
});

// Then, define the upload middleware using the storage
const dpUpload = multer({
  storage: dpStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB file size limit
    files: 1 // Only one file per upload
  },
  fileFilter: (req, file, cb) => {
    // Allow common image types
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'), false);
    }
  }
});
const postStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'posts',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov'],
    transformation: [
      { quality: 'auto' }, // Automatic quality optimization
      { fetch_format: 'auto' }  // Automatic format conversion based on browser
    ]
  }
});

const postUpload = multer({
  storage: postStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
    files: 10 // Allow up to 10 files per post
  },
  fileFilter: (req, file, cb) => {
    // Validate file type
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
    }
  }
});
// Specific Cloudinary storage for chat attachments
const chatAttachmentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_attachments',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
    transformation: [
      { quality: 'auto' }, // Automatic quality optimization
      { fetch_format: 'auto' }  // Automatic format conversion based on browser
    ]
  }
});

// Create upload middleware specifically for chat attachments
const chatUpload = multer({
  storage: chatAttachmentStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB file size limit for chat attachments
    files: 1 // Only one file per message
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 
      'video/mp4', 'video/quicktime',
      'application/pdf', 
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, and common document formats are allowed.'), false);
    }
  }
});
// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// ========================
// MONGODB SCHEMAS
// ========================

// Original Schemas (Updated)
const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  chatRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'video', 'file', 'poll', 'call', 'location'],
    default: 'text'
  },
  mediaUrl: String,
  fileName: String,
  fileSize: Number,
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reaction: String
  }],
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  updatedAt: Date
});

const chatRoomSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  type: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  name: String,
  description: String,
  image: String,
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  pinnedMessages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  muted: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    until: Date
  }],
  callHistory: [{
    initiator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    callType: {
      type: String,
      enum: ['audio', 'video']
    },
    startTime: Date,
    endTime: Date,
    duration: Number, // in seconds
    participants: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      joinedAt: Date,
      leftAt: Date
    }],
    status: {
      type: String,
      enum: ['missed', 'declined', 'completed']
    }
  }],
  polls: [{
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    question: String,
    options: [{
      text: String,
      votes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }],
    multipleChoice: {
      type: Boolean,
      default: false
    },
    expiresAt: Date,
    closed: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
});

const storySchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filter: { type: String, default: 'none' },
  textPosition: { type: String, default: 'bottom' },
  content: {
   type: String,
  default: ''
  },
  mediaUrl: {
    type: String,
    required: true
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  location: {
    name: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  backgroundStyle: {
    backgroundColor: String,
    textColor: String,
    fontStyle: String
  },
  mentions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    position: {
      x: Number,
      y: Number
    }
  }],
  stickers: [{
    imageUrl: String,
    position: {
      x: Number,
      y: Number
    },
    rotation: Number,
    scale: Number
  }],
  linkUrl: String,
  viewers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reaction: {
      type: String,
      enum: ['heart', 'laugh', 'wow', 'sad', 'angry', 'fire', 'clap', 'question']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  replies: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  privacy: {
    type: String,
    enum: ['public', 'connections', 'close-friends'],
    default: 'public'
  },
  featured: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // 24 hours in seconds
  }
});
// Profile View Schema
const profileViewSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  viewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  visibility: {
    type: String,
    enum: ['full', 'limited', 'anonymous'],
    default: 'full'
  },
  viewedAt: {
    type: Date,
    default: Date.now
  }
});

// Create indexes for better query performance
profileViewSchema.index({ profileId: 1, viewedAt: -1 });
profileViewSchema.index({ viewerId: 1, viewedAt: -1 });
profileViewSchema.index({ profileId: 1, viewerId: 1, viewedAt: -1 });

const ProfileView = mongoose.model('ProfileView', profileViewSchema);
const highlightSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  stories: [{
    content: String,
    mediaUrl: String,
    mediaType: {
      type: String,
      enum: ['image', 'video']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'link', 'poll', 'article', 'job', 'event'],
    default: 'text'
  },
  images: [{
    url: String,
    caption: String,
    altText: String,
    order: Number
  }],
  videos: [{
    url: String,
    thumbnail: String,
    caption: String,
    duration: Number
  }],
  visibility: {
    type: String,
    enum: ['public', 'connections', 'private'],
    default: 'public'
  },
  linkPreview: {
    url: String,
    title: String,
    description: String,
    imageUrl: String
  },
  location: {
    name: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  mentions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    position: {
      start: Number,
      end: Number
    }
  }],
  hashtags: [String],
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reaction: {
      type: String,
      enum: ['like', 'love', 'celebrate', 'support', 'insightful', 'curious'],
      default: 'like'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  bookmarks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    mentions: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      position: {
        start: Number,
        end: Number
      }
    }],
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    parentComment: {
      type: mongoose.Schema.Types.ObjectId
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date
    }
  }],
  pollData: {
    question: String,
    options: [{
      text: String,
      votes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }],
    expiresAt: Date,
    allowMultipleVotes: {
      type: Boolean,
      default: false
    }
  },
  articleData: {
    title: String,
    subtitle: String,
    coverImage: String,
    readTime: Number, // in minutes
    sections: [{
      heading: String,
      content: String,
      mediaUrl: String,
      mediaType: String
    }]
  },
  eventData: {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event'
    },
    title: String,
    startDate: Date,
    endDate: Date,
    location: String,
    coverImage: String
  },
  jobData: {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job'
    },
    title: String,
    company: String,
    location: String,
    description: String
  },
  shareCount: {
    type: Number,
    default: 0
  },
  impressions: {
    type: Number,
    default: 0
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: Date
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  lastUpdated: {
    type: Date
  },
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Enhanced User Schema
const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    unique: true,
    sparse: true, // Allow null for phone-only users
    lowercase: true,
    trim: true
  },
  password: { 
    type: String,
    required: function() {
      return this.authProvider === 'local';
    }
  },
  phoneNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  googleId: String,
  linkedinId: String,
  authProvider: {
    type: String,
    enum: ['local', 'google', 'linkedin', 'phone'],
    default: 'local'
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  profilePicture: String,
  headline: String,
  industry: String,
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      default: [0, 0]
    },
    address: String,
    lastUpdated: Date
  },
  connections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  pendingConnections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  skills: [{
    name: String,
    endorsements: Number
  }],
  online: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  deviceTokens: [String],

  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  restrictedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  mutedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  privacy: {
    profileVisibility: {
      type: String,
      enum: ['public', 'connections', 'followers', 'private'],
      default: 'public'
    },
    storyVisibility: {
      type: String,
      enum: ['public', 'connections', 'followers', 'close-friends'],
      default: 'followers'
    },
    messagePermission: {
      type: String,
      enum: ['everyone', 'followers', 'connections', 'nobody'],
      default: 'everyone'
    },
    activityStatus: {
      type: String,
      enum: ['everyone', 'followers', 'connections', 'nobody'],
      default: 'everyone'
    },
    searchability: {
      type: Boolean,
      default: true
    }
  },

  portfolio: {
    bio: String,
    headline: String,
    about: String,
    workExperience: [{
      company: String,
      position: String,
      description: String,
      startDate: Date,
      endDate: Date,
      current: Boolean,
      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
      }
    }],
    education: [{
      institution: String,
      degree: String,
      field: String,
      startDate: Date,
      endDate: Date,
      current: Boolean
    }],
    languages: [{
      name: String,
      proficiency: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'native']
      }
    }],
    certifications: [{
      name: String,
      issuer: String,
      issueDate: Date,
      expirationDate: Date,
      credentialId: String,
      url: String
    }],
    interests: [String]
  },

  security: {
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorMethod: {
      type: String,
      enum: ['app', 'sms', 'email'],
      default: 'sms'
    },
    twoFactorSecret: String,
    twoFactorBackupCodes: [String],
    lastPasswordChange: Date,
    passwordResetTokens: [{
      token: String,
      expiresAt: Date
    }],
    loginHistory: [{
      date: Date,
      ipAddress: String,
      device: String,
      location: String
    }],
    activeLoginSessions: [{
      token: String,
      device: String,
      lastActive: Date,
      expiresAt: Date
    }]
  },

  verification: {
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationDate: Date,
    verificationEvidence: [String]
  },

  analytics: {
    profileViews: {
      count: {
        type: Number,
        default: 0
      },
      lastReset: {
        type: Date,
        default: Date.now
      },
      history: [{
        date: Date,
        count: Number
      }]
    },
    contentEngagement: {
      likes: {
        type: Number,
        default: 0
      },
      comments: {
        type: Number,
        default: 0
      },
      shares: {
        type: Number,
        default: 0
      }
    }
  },

  notificationPreferences: {
    email: {
      messages: {
        type: Boolean,
        default: true
      },
      connections: {
        type: Boolean,
        default: true
      },
      mentions: {
        type: Boolean,
        default: true
      },
      events: {
        type: Boolean,
        default: true
      },
      jobs: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      }
    },
    push: {
      messages: {
        type: Boolean,
        default: true
      },
      connections: {
        type: Boolean,
        default: true
      },
      mentions: {
        type: Boolean,
        default: true
      },
      events: {
        type: Boolean,
        default: true
      },
      jobs: {
        type: Boolean,
        default: true
      }
    },
    inApp: {
      messages: {
        type: Boolean,
        default: true
      },
      connections: {
        type: Boolean,
        default: true
      },
      mentions: {
        type: Boolean,
        default: true
      },
      events: { 
        type: Boolean,
        default: true
      },
      jobs: {
        type: Boolean,
        default: true
      }
    }
  }
}, { timestamps: true }); // Enables createdAt and updatedAt fields

module.exports = mongoose.model('User', userSchema);


// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Password validation method
userSchema.methods.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

// Add indexes
userSchema.index({ location: '2dsphere' });
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ skills: 1 });
userSchema.index({ industry: 1 });
userSchema.index({ 'portfolio.workExperience.company': 1 });
userSchema.index({ 'portfolio.education.institution': 1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ tags: 1 });

// ========================
// NEW SCHEMA DEFINITIONS
// ========================

// DISCOVERY SYSTEM

// Event Schema
const eventSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  eventType: {
    type: String,
    enum: ['in-person', 'virtual', 'hybrid'],
    required: true
  },
  category: {
    type: String,
    required: true
  },
  tags: [String],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  location: {
    address: String,
    city: String,
    country: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    },
    virtual: {
      platform: String,
      link: String
    }
  },
  coverImage: String,
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['going', 'interested', 'not-going'],
      default: 'interested'
    }
  }],
  privacy: {
    type: String,
    enum: ['public', 'private', 'invite-only'],
    default: 'public'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Podcast Schema
const podcastSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  coverImage: String,
  category: {
    type: String,
    required: true
  },
  tags: [String],
  episodes: [{
    title: String,
    description: String,
    audioUrl: String,
    duration: Number, // in seconds
    releaseDate: Date,
    guests: [{
      name: String,
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  }],
  subscribers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Job Posting Schema
const jobSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    name: String,
    logo: String,
    website: String,
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company'
    }
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  jobType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'internship', 'remote'],
    required: true
  },
  location: {
    city: String,
    country: String,
    remote: Boolean
  },
  salary: {
    min: Number,
    max: Number,
    currency: String,
    period: {
      type: String,
      enum: ['hourly', 'monthly', 'yearly']
    },
    isVisible: {
      type: Boolean,
      default: true
    }
  },
  requirements: [String],
  responsibilities: [String],
  skills: [String],
  experienceLevel: {
    type: String,
    enum: ['entry', 'mid', 'senior', 'lead', 'executive'],
    required: true
  },
  industry: String,
  applicationDeadline: Date,
  applicationLink: String,
  applicants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['applied', 'reviewing', 'interviewed', 'offered', 'hired', 'rejected'],
      default: 'applied'
    },
    appliedAt: {
      type: Date,
      default: Date.now
    }
  }],
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Company Schema
const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  logo: String,
  coverImage: String,
  website: String,
  industry: String,
  size: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+']
  },
  founded: Number,
  headquarters: {
    city: String,
    country: String
  },
  locations: [{
    city: String,
    country: String
  }],
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  employees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    position: String,
    verified: {
      type: Boolean,
      default: false
    }
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// PORTFOLIO SYSTEM

// Project Schema
const projectSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  category: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Bookmark Schema
const bookmarkSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collections: [{
    name: {
      type: String,
      required: true
    },
    description: String,
    privacy: {
      type: String,
      enum: ['private', 'public'],
      default: 'private'
    },
    items: [{
      contentType: {
        type: String,
        enum: ['post', 'event', 'podcast', 'job', 'project'],
        required: true
      },
      contentId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'collections.items.contentType',
        required: true
      },
      savedAt: {
        type: Date,
        default: Date.now
      },
      notes: String
    }]
  }]
});

// Report Schema
const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contentType: {
    type: String,
    enum: ['post', 'comment', 'message', 'user', 'event', 'podcast', 'job'],
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  reason: {
    type: String,
    enum: ['spam', 'harassment', 'inappropriate', 'violence', 'intellectual-property', 'fraud', 'other'],
    required: true
  },
  description: String,
  status: {
    type: String,
    enum: ['pending', 'under-review', 'resolved', 'dismissed'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolution: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// SOCIAL FEATURES

// Mention Schema
const mentionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mentionedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contentType: {
    type: String,
    enum: ['post', 'comment', 'message', 'event', 'project'],
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'contentType'
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Recommendation Schema
const recommendationSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  relationship: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  skills: [String],
  status: {
    type: String,
    enum: ['pending', 'approved', 'declined', 'hidden'],
    default: 'pending'
  },
  featured: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Notification Schema

// Streak Schema
const streakSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  category: String,
  target: {
    type: String,
    enum: ['daily', 'weekly', 'custom'],
    default: 'daily'
  },
  customFrequency: {
    daysPerWeek: Number,
    specificDays: [Number] // 0-6, where 0 is Sunday
  },
  activity: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  totalCompletions: {
    type: Number,
    default: 0
  },
  checkIns: [{
    date: Date,
    completed: Boolean,
    notes: String,
    evidence: String // URL to photo/video evidence
  }],
  reminderTime: Date,
  visibility: {
    type: String,
    enum: ['public', 'connections', 'private'],
    default: 'public'
  },
  supporters: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Achievement Schema
const achievementSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  category: String,
  dateAchieved: {
    type: Date,
    required: true
  },
  issuer: String,
  certificateUrl: String,
  verificationUrl: String,
  expirationDate: Date,
  image: String,
  visibility: {
    type: String,
    enum: ['public', 'connections', 'private'],
    default: 'public'
  },
  featured: {
    type: Boolean,
    default: false
  },
  endorsements: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    date: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// AUXILIARY SYSTEMS

// Hashtag Schema
const hashtagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  postCount: {
    type: Number,
    default: 0
  },
  eventCount: {
    type: Number,
    default: 0
  },
  podcastCount: {
    type: Number,
    default: 0
  },
  jobCount: {
    type: Number,
    default: 0
  },
  followerCount: {
    type: Number,
    default: 0
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  trending: {
    type: Boolean,
    default: false
  },
  category: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});
// Notification Schema (continued)
const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: [
      'message', 'connection_request', 'connection_accepted', 
      'mention', 'like', 'comment', 'follow', 'event_invite',
      'project_collaboration', 'job_recommendation', 'endorsement',
      'recommendation', 'streak_support', 'achievement',
      'event_rsvp', 'event_interest', 'new_episode', 'podcast_subscription',
      'job_application', 'stream_scheduled', 'stream_started', 'new_subscriber'
    ],
    required: true
  },
  contentType: {
    type: String,
    enum: ['post', 'comment', 'message', 'user', 'event', 'podcast', 'job', 'project', 'streak', 'achievement', 'subscription', 'stream', 'recommendation'],
    required: true
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  actionUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// LIVESTREAMING SYSTEM

// Stream Schema
const streamSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  streamKey: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended'],
    default: 'scheduled'
  },
  scheduledFor: Date,
  startedAt: Date,
  endedAt: Date,
  viewers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: Date,
    leftAt: Date
  }],
  maxConcurrentViewers: {
    type: Number,
    default: 0
  },
  totalViews: {
    type: Number,
    default: 0
  },
  privacy: {
    type: String,
    enum: ['public', 'connections', 'private'],
    default: 'public'
  },
  tags: [String],
  chat: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  reactions: [{
    type: {
      type: String,
      enum: ['like', 'love', 'wow', 'laugh', 'sad', 'angry']
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  recordingUrl: String,
  thumbnailUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// MONETIZATION SYSTEM

// Creator Program Schema
const creatorProgramSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  paymentInfo: {
    paypalEmail: String,
    bankAccount: {
      accountName: String,
      accountNumber: String,
      routingNumber: String,
      bankName: String
    }
  },
  taxInfo: {
    country: String,
    taxId: String,
    businessName: String,
    businessType: String
  },
  earnings: {
    total: {
      type: Number,
      default: 0
    },
    available: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    },
    history: [{
      amount: Number,
      source: {
        type: String,
        enum: ['subscription', 'donation', 'content_sale']
      },
      sourceId: mongoose.Schema.Types.ObjectId,
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed']
      },
      date: {
        type: Date,
        default: Date.now
      }
    }]
  },
  subscriptionTiers: [{
    name: String,
    price: Number,
    interval: {
      type: String,
      enum: ['monthly', 'yearly']
    },
    benefits: [String],
    subscribers: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      startDate: Date,
      renewalDate: Date,
      status: {
        type: String,
        enum: ['active', 'cancelled', 'expired']
      }
    }]
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ========================
// MONGOOSE MODELS
// ========================

// Original models
const Message = mongoose.model('Message', messageSchema);
const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Story = mongoose.model('Story', storySchema);
const Highlight = mongoose.model('Highlight', highlightSchema);

// New discovery system models
const Event = mongoose.model('Event', eventSchema);
const Podcast = mongoose.model('Podcast', podcastSchema);
const Job = mongoose.model('Job', jobSchema);
const Company = mongoose.model('Company', companySchema);

// Portfolio system models
const Project = mongoose.model('Project', projectSchema);
const Streak = mongoose.model('Streak', streakSchema);
const Achievement = mongoose.model('Achievement', achievementSchema);

// Auxiliary system models
const Hashtag = mongoose.model('Hashtag', hashtagSchema);
const Bookmark = mongoose.model('Bookmark', bookmarkSchema);
const Report = mongoose.model('Report', reportSchema);

// Social feature models
const Mention = mongoose.model('Mention', mentionSchema);
const Recommendation = mongoose.model('Recommendation', recommendationSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// Live streaming model
const Stream = mongoose.model('Stream', streamSchema);

// Monetization model
const CreatorProgram = mongoose.model('CreatorProgram', creatorProgramSchema);

// ========================
// PASSPORT STRATEGIES
// ========================

// LinkedIn Strategy
passport.use(new LinkedInStrategy({
  clientID: LINKEDIN_CLIENT_ID,
  clientSecret: LINKEDIN_CLIENT_SECRET,
  callbackURL: `${BASE_URL}/auth/linkedin/callback`,
  scope: ['profile', 'email'],
  state: true
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ linkedinId: profile.id });

    if (!user) {
      user = await User.create({
        linkedinId: profile.id,
        email: profile.emails[0].value,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        profilePicture: profile.photos[0]?.value,
        authProvider: 'linkedin'
      });
    }

    return done(null, user);
  } catch (error) {
    console.error("Error in LinkedIn authentication:", error);
    return done(error, null);
  }
}));

// Google Strategy
// Improved Google Strategy with explicit isNewUser flag
passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: `${BASE_URL}/auth/google/callback`,
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    if (!profile.id) {
      return done(null, false, { message: 'Google authentication failed' });
    }

    const email = profile.emails?.[0]?.value || null;

    // Check if user already exists
    let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] }).lean();

    // Flag to track if this is a truly new user
    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await User.create({
        googleId: profile.id,
        email,
        firstName: profile.name?.givenName || '',
        lastName: profile.name?.familyName || '',
        profilePicture: profile.photos?.[0]?.value || null,
        authProvider: 'google',
        createdAt: new Date(),
      });

      // Explicitly mark as new user
      isNewUser = true;
      console.log('New user created:', user._id);
    } else if (!user.googleId) {
      // Link Google ID to an existing email-based user
      await User.findByIdAndUpdate(user._id, { googleId: profile.id }, { new: true });
      console.log('Linked Google account to existing user:', user._id);
    }

    // Attach isNewUser flag to the user object
    user.isNewUser = isNewUser;

    return done(null, user);
  } catch (error) {
    console.error('Error in Google authentication:', error);
    return done(error, null);
  }
}));

// ========================
// HELPER FUNCTIONS
// ========================

// Create notification
async function createNotification(data) {
  try {
    return await Notification.create(data);
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

// Update hashtags
async function updateHashtags(tags, contentType, oldTags = []) {
  try {
    // Convert tags to lowercase
    const lowerTags = tags.map(tag => tag.toLowerCase());
    const lowerOldTags = oldTags.map(tag => tag.toLowerCase());
    
    // Find new tags
    const newTags = lowerTags.filter(tag => !lowerOldTags.includes(tag));
    
    // Find removed tags
    const removedTags = lowerOldTags.filter(tag => !lowerTags.includes(tag));
    
    // Update hashtag counts for new tags
    for (const tag of newTags) {
      const updateFields = {};
      
      switch (contentType) {
        case 'event':
          updateFields.eventCount = 1;
          break;
        case 'podcast':
          updateFields.podcastCount = 1;
          break;
        case 'job':
          updateFields.jobCount = 1;
          break;
        default:
          updateFields.postCount = 1;
      }
      
      await Hashtag.findOneAndUpdate(
        { name: tag },
        { 
          $inc: updateFields,
          $setOnInsert: { name: tag }
        },
        { upsert: true, new: true }
      );
    }
    
    // Update hashtag counts for removed tags
    for (const tag of removedTags) {
      const updateFields = {};
      
      switch (contentType) {
        case 'event':
          updateFields.eventCount = -1;
          break;
        case 'podcast':
          updateFields.podcastCount = -1;
          break;
        case 'job':
          updateFields.jobCount = -1;
          break;
        default:
          updateFields.postCount = -1;
      }
      
      await Hashtag.findOneAndUpdate(
        { name: tag },
        { $inc: updateFields }
      );
    }
    
    // Update trending status
    await updateTrendingHashtags();
    
    return true;
  } catch (error) {
    console.error('Update hashtags error:', error);
    return false;
  }
}

// Update trending hashtags
async function updateTrendingHashtags() {
  try {
    // Get all hashtags
    const hashtags = await Hashtag.find({});
    
    // Update trending status based on total counts
    const sortedHashtags = hashtags.sort((a, b) => {
      const totalA = a.postCount + a.eventCount + a.podcastCount + a.jobCount;
      const totalB = b.postCount + b.eventCount + b.podcastCount + b.jobCount;
      return totalB - totalA;
    });
    
    const trending = sortedHashtags.slice(0, 20).map(h => h._id);
    
    // Update trending status
    await Hashtag.updateMany(
      { _id: { $in: trending } },
      { trending: true }
    );
    
    await Hashtag.updateMany(
      { _id: { $nin: trending } },
      { trending: false }
    );
    
    return true;
  } catch (error) {
    console.error('Update trending hashtags error:', error);
    return false;
  }
}

// Check if two users are connected
async function areConnected(userId1, userId2) {
  try {
    const user = await User.findById(userId1);
    return user && user.connections.includes(userId2);
  } catch (error) {
    console.error('Check connection error:', error);
    return false;
  }
}

// Check if same day for streaks
function isSameDay(date1, date2) {
  return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
}

// Get day difference
function getDayDifference(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
  const diffDays = Math.round(Math.abs((date1 - date2) / oneDay));
  return diffDays;
}

// Check if valid streak day
function isValidStreakDay(dayDiff, target, customFrequency) {
  switch (target) {
    case 'daily':
      return dayDiff === 1;
    case 'weekly':
      return dayDiff <= 7;
    case 'custom':
      // For custom frequency, check if days per week matches
      if (customFrequency && customFrequency.daysPerWeek) {
        return dayDiff <= (7 / customFrequency.daysPerWeek);
      }
      return false;
    default:
      return false;
  }
}

// Helper for session management
function updateUserSession(user, token, device) {
  // Create new session
  const session = {
    token,
    device,
    lastActive: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days expiration
  };
  
  // Initialize if doesn't exist
  if (!user.security) {
    user.security = {};
  }
  
  if (!user.security.activeLoginSessions) {
    user.security.activeLoginSessions = [];
  }
  
  // Add session
  user.security.activeLoginSessions.push(session);
}

// Update user and return token
async function updateUserAndReturnToken(user, deviceToken, res) {
  // Update device token if provided
  if (deviceToken && !user.deviceTokens.includes(deviceToken)) {
    user.deviceTokens.push(deviceToken);
  }
  
  // Update last active time
  user.lastActive = new Date();
  
  // Generate JWT token
  const token = jwt.sign(
    { id: user._id, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  
  // Add to active sessions
  updateUserSession(user, token, deviceToken ? 'mobile' : 'web');
  
  // Add login history
  if (!user.security) {
    user.security = {};
  }
  
  if (!user.security.loginHistory) {
    user.security.loginHistory = [];
  }
  
  user.security.loginHistory.push({
    date: new Date(),
    ipAddress: 'unknown', // In a real app, get from request
    device: deviceToken ? 'mobile' : 'web',
    location: 'unknown' // In a real app, could use GeoIP
  });
  
  await user.save();

  // Prepare user object for response (remove sensitive data)
  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.deviceTokens;
  delete userResponse.security.twoFactorSecret;
  delete userResponse.security.twoFactorBackupCodes;


// Send the response with isNewUser flag
res.json({
  token,
  user: userResponse,
});
  // Send the response
 
}

// Calculate distance using Google Maps API
async function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${GOOGLE_MAPS_API_KEY}`
    );

    return response.data.rows[0].elements[0].distance;
  } catch (error) {
    console.error('Distance calculation error:', error);
    return null;
  }
}
const storyStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'stories',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov'],
    transformation: [
      { quality: 'auto:good' }, // Automatic quality optimization
      { fetch_format: 'auto' }  // Automatic format conversion based on browser
    ]
  }
});

// Setup upload middleware with file size limits
const storyUpload = multer({
  storage: storyStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for video stories
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Validate file type
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
    }
  }
});
// ========================
// API ROUTES
// ========================

// ----------------------
// AUTHENTICATION ROUTES
// ----------------------

app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, deviceToken } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = await User.create({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      deviceTokens: deviceToken ? [deviceToken] : [],
      authProvider: 'local'
    });
    
    // Update user and return token
    await updateUserAndReturnToken(user, deviceToken, res);
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Error creating user' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password, phoneNumber, code, deviceToken, authProvider } = req.body;

    // Determine authentication method
    if (authProvider === 'phone' && phoneNumber) {
      // Phone authentication
      if (!code) {
        return res.status(400).json({ error: 'Verification code is required for phone login' });
      }

      // Verify the code with Twilio
      const verification = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE)
        .verificationChecks
        .create({ to: phoneNumber, code });

      if (!verification.valid) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // Find user by phone number
      const user = await User.findOne({ phoneNumber, authProvider: 'phone' });
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Update user and return token
      await updateUserAndReturnToken(user, deviceToken, res);
    } 
    else if ((authProvider === 'google' || authProvider === 'linkedin') && email) {
      // For social logins, we need to redirect to their respective auth routes
      return res.status(400).json({ 
        error: 'For Google or LinkedIn authentication, please use the dedicated auth endpoints',
        redirectUrl: authProvider === 'google' ? '/auth/google' : '/auth/linkedin'
      });
    }
    else if (email && password) {
      // Traditional email/password login
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Check if this user has a password (local auth provider)
      if (!user.password) {
        // Suggest the correct auth method
        return res.status(400).json({ 
          error: `This account uses ${user.authProvider} authentication. Please login with that method.`,
          authProvider: user.authProvider
        });
      }

      const isValid = await user.validatePassword(password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Update user and return token
      await updateUserAndReturnToken(user, deviceToken, res);
    } 
    else {
      return res.status(400).json({ error: 'Invalid login credentials provided' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error logging in' });
  }
});

// LinkedIn routes
// Add this environment variable to your .env file
// FRONTEND_URL=http://localhost:3000 (or your actual frontend URL)

// LinkedIn routes - updated
app.get('/auth/linkedin', (req, res) => {
  // Store the intended redirect destination if provided
  const redirectTo = req.query.redirectTo || '/dashboard';
  // Store it in the session for use after authentication
  req.session.redirectTo = redirectTo;
  
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=openid%20profile%20email`;
  res.redirect(authUrl);
});

app.get('/auth/linkedin/callback', async (req, res) => {
  const authorizationCode = req.query.code;

  if (!authorizationCode) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
  }

  try {
    // Create form data properly
    const formData = new URLSearchParams();
    formData.append('grant_type', 'authorization_code');
    formData.append('code', authorizationCode);
    formData.append('redirect_uri', REDIRECT_URI);
    formData.append('client_id', LINKEDIN_CLIENT_ID);
    formData.append('client_secret', LINKEDIN_CLIENT_SECRET);

    const response = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token } = response.data;
    
    // Get user profile data with the access token
    const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'cache-control': 'no-cache',
      },
    });
    
    const linkedinId = profileResponse.data.id;
    const email = profileResponse.data.email;
    let firstName = profileResponse.data.localizedFirstName || profileResponse.data.firstName || profileResponse.data.given_name || 'Unknown';
    let lastName = profileResponse.data.localizedLastName || profileResponse.data.lastName || profileResponse.data.family_name || 'User';
    
    // Find or create user
    let user = await User.findOne({ linkedinId });
    let isNewUser = false;
    
    if (!user) {
      // This is a new user
      isNewUser = true;
      user = await User.create({
        linkedinId,
        email,
        firstName,
        lastName,
        authProvider: 'linkedin',
        createdAt: new Date() // Ensure creation date is set
      });
    } else {
      // Update existing user with latest LinkedIn data
      user.email = email;
      user.firstName = firstName;
      user.lastName = lastName;
      await user.save();
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Get the intended redirect destination based on new user status
    const redirectTo = isNewUser ? '/profile-setup' : (req.session.redirectTo || '/dashboard');
    
    console.log(`Redirecting LinkedIn auth to: ${process.env.FRONTEND_URL}/auth/callback?token=${token}&redirect=${encodeURIComponent(redirectTo)}&isNewUser=${isNewUser}`);
    
    // Redirect to frontend with token and isNewUser flag
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&redirect=${encodeURIComponent(redirectTo)}&isNewUser=${isNewUser ? 'true' : 'false'}`);
  } catch (error) {
    console.error('Error during LinkedIn authentication:', error.response ? error.response.data : error.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
  }
});

// Google Routes - updated
// Google Routes - improved new user detection
app.get('/auth/google', (req, res) => {
  // Store the intended redirect destination if provided
  const redirectTo = req.query.redirectTo || '/dashboard';
  // Store it in the session for use after authentication
  req.session.redirectTo = redirectTo;
  
  passport.authenticate('google')(req, res);
});

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=auth_failed' }),
  async (req, res) => {
    try {
      // Check if this is a new user
      // Use both explicit isNewUser flag from passport strategy and created timestamp
      const isNewUser = req.user.isNewUser || 
          (req.user.createdAt && ((new Date() - new Date(req.user.createdAt)) < 60000)); // Created within last minute
      
      console.log('Is new user:', isNewUser);
      console.log('User creation time:', req.user.createdAt);
      
      // Generate token
      const token = jwt.sign(
        { id: req.user._id, email: req.user.email },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // The redirectTo should be profile-setup for new users, otherwise use session or default
      const redirectTo = isNewUser 
        ? '/profile-setup' 
        : (req.session.redirectTo || '/dashboard');
      
      // Add isNewUser flag to URL so frontend knows this is a new user
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${token}&redirect=${encodeURIComponent(redirectTo)}&isNewUser=${isNewUser ? 'true' : 'false'}`;
      
      console.log(`Redirecting to: ${redirectUrl}`);
      
      // Redirect the user to the frontend with the token and new user flag
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Error in Google auth callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
    }
  }
);

// Add a convenient endpoint to get user data by token
app.get('/api/me', authenticateToken, async (req, res) => {
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
// Phone Authentication Routes
app.post('/auth/phone/send-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE)
      .verifications
      .create({ to: phoneNumber, channel: 'sms' });

    res.json({ message: 'Verification code sent' });
  } catch (error) {
    console.error('Send verification code error:', error);
    res.status(500).json({ error: 'Error sending verification code' });
  }
});

app.post('/auth/phone/verify', async (req, res) => {
  try {
    const { phoneNumber, code, deviceToken } = req.body;

    const verification = await twilioClient.verify.v2.services(TWILIO_VERIFY_SERVICE)
      .verificationChecks
      .create({ to: phoneNumber, code });

    if (!verification.valid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    let user = await User.findOne({ phoneNumber });

    if (!user) {
      // Generate a random name for the user based on the phone number
      const randomName = `User${Math.floor(1000 + Math.random() * 9000)}`;
      
      user = await User.create({
        phoneNumber,
        phoneVerified: true,
        authProvider: 'phone',
        firstName: randomName,
        lastName: phoneNumber.slice(-4) // Last 4 digits as default last name
      });
    } else {
      user.phoneVerified = true;
      await user.save();
    }

    // Update user session and return token
    await updateUserAndReturnToken(user, deviceToken, res);
    
  } catch (error) {
    console.error('Verify phone error:', error);
    res.status(500).json({ error: 'Error verifying phone number' });
  }
});

// Two-Factor Authentication
app.post('/api/auth/2fa/setup', authenticateToken, async (req, res) => {
  try {
    const { method } = req.body;
    
    if (!['app', 'sms', 'email'].includes(method)) {
      return res.status(400).json({ error: 'Invalid 2FA method' });
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate secret for app based 2FA
    let secret = null;
    let qrCodeUrl = null;
    
    if (method === 'app') {
      // Generate a secure secret
      secret = crypto.randomBytes(20).toString('hex');
      
      // In a real implementation, you would generate a QR code URL
      qrCodeUrl = `otpauth://totp/YourApp:${user.email}?secret=${secret}&issuer=YourApp`;
    }
    
    // Initialize security if doesn't exist
    if (!user.security) {
      user.security = {};
    }
    
    // Update user security settings
    user.security.twoFactorEnabled = false; // Not yet verified
    user.security.twoFactorMethod = method;
    user.security.twoFactorSecret = secret;
    
    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(crypto.randomBytes(4).toString('hex'));
    }
    user.security.twoFactorBackupCodes = backupCodes;
    
    await user.save();
    
    res.json({
      method,
      secret,
      qrCodeUrl,
      backupCodes,
      verified: false
    });
  } catch (error) {
    console.error('Setup 2FA error:', error);
    res.status(500).json({ error: 'Error setting up 2FA' });
  }
});

// Check auth provider for email/phone
app.post('/auth/check-provider', async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;
    
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }
    
    let user;
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
    } else {
      user = await User.findOne({ phoneNumber });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ authProvider: user.authProvider });
  } catch (error) {
    console.error('Check provider error:', error);
    res.status(500).json({ error: 'Error checking authentication provider' });
  }
});

// Logout - Revoke token
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization'].split(' ')[1];
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove this session
    if (user.security && user.security.activeLoginSessions) {
      user.security.activeLoginSessions = user.security.activeLoginSessions.filter(
        session => session.token !== token
      );
    }
    
    // Mark user as offline
    user.online = false;
    user.lastActive = new Date();
    
    await user.save();
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Error logging out' });
  }
});// ----------------------
// USER PROFILE ROUTES
// ----------------------

app.put('/api/profile', authenticateToken, dpUpload.single('profileImage'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      headline,
      industry,
      skills,
      password,
      currentPassword,
      portfolio,
      socialLinks,
      location,
      email,
      phoneNumber,
      about
    } = req.body;

    if (firstName === '') return res.status(400).json({ error: 'First name cannot be empty' });
    if (lastName === '') return res.status(400).json({ error: 'Last name cannot be empty' });

    // Get the current user with password field
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateFields = {};
    
    // Basic fields
    if (firstName) updateFields.firstName = firstName.trim();
    if (lastName) updateFields.lastName = lastName.trim();
    if (headline) updateFields.headline = headline.trim();
    if (industry) updateFields.industry = industry.trim();
    if (email) updateFields.email = email.trim();
    if (phoneNumber) updateFields.phoneNumber = phoneNumber.trim();
    
    // Handle file upload - if a file was uploaded, update the profilePicture field
    if (req.file) {
      // Create a URL path to the uploaded file
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const relativePath = path.relative(path.join(__dirname, '..'), req.file.path);
      updateFields.profilePicture = req.file.path;
      
  
      
      // Optional: Delete the old profile picture file if it exists and isn't the default
      if (currentUser.profilePicture && 
          !currentUser.profilePicture.includes('default') && 
          fs.existsSync(currentUser.profilePicture)) {
        try {
          fs.unlinkSync(currentUser.profilePicture);
        } catch (err) {
          console.error('Error deleting old profile picture:', err);
          // Continue with the update even if deletion fails
        }
      }
    }

    // Handle password update
    if (password) {
      // For users who signed up with social or phone, they might not have a password
      if (currentUser.authProvider !== 'local') {
        // Social/phone users can set a password without providing current password
        updateFields.password = password;
        // Update auth provider to include local option as well
        updateFields.authProvider = 'local';
      } else {
        // For users who already have a password, require current password
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password is required to update password' });
        }
        
        // Verify current password
        const isValidPassword = await currentUser.validatePassword(currentPassword);
        if (!isValidPassword) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        updateFields.password = password;
      }
    }

    // Handle skills update - parse from string if needed
    if (skills) {
      let parsedSkills;
      
      // Handle skills whether it's a JSON string or already parsed
      if (typeof skills === 'string') {
        try {
          parsedSkills = JSON.parse(skills);
        } catch (e) {
          // If it's not valid JSON, treat it as a comma-separated string
          parsedSkills = skills.split(',').map(s => s.trim()).filter(s => s);
        }
      } else {
        parsedSkills = skills;
      }
      
      // Convert to the expected format
      if (Array.isArray(parsedSkills)) {
        updateFields.skills = parsedSkills.map(skill => 
          typeof skill === 'object' 
            ? { name: skill.name.trim(), endorsements: skill.endorsements || 0 }
            : { name: skill.trim(), endorsements: 0 }
        );
      }
    }
    
    // Handle location update
    if (location) {
      let parsedLocation;
      
      // Parse location if it's a string
      if (typeof location === 'string') {
        try {
          parsedLocation = JSON.parse(location);
        } catch (e) {
          parsedLocation = { address: location.trim() };
        }
      } else {
        parsedLocation = location;
      }
      
      // Update location fields
      if (parsedLocation.address) updateFields['location.address'] = parsedLocation.address.trim();
      if (parsedLocation.city) updateFields['location.city'] = parsedLocation.city.trim();
      if (parsedLocation.state) updateFields['location.state'] = parsedLocation.state.trim();
      if (parsedLocation.country) updateFields['location.country'] = parsedLocation.country.trim();
    }
    
    // Handle social links update
    if (socialLinks) {
      let parsedLinks;
      
      // Parse social links if it's a string
      if (typeof socialLinks === 'string') {
        try {
          parsedLinks = JSON.parse(socialLinks);
        } catch (e) {
          parsedLinks = {};
        }
      } else {
        parsedLinks = socialLinks;
      }
      
      // Update social link fields
      if (parsedLinks.linkedin) updateFields['socialLinks.linkedin'] = parsedLinks.linkedin.trim();
      if (parsedLinks.twitter) updateFields['socialLinks.twitter'] = parsedLinks.twitter.trim();
      if (parsedLinks.website) updateFields['socialLinks.website'] = parsedLinks.website.trim();
    }
    
    // Handle portfolio update
    if (portfolio) {
      let parsedPortfolio;
      
      // Parse portfolio if it's a string
      if (typeof portfolio === 'string') {
        try {
          parsedPortfolio = JSON.parse(portfolio);
        } catch (e) {
          parsedPortfolio = {};
        }
      } else {
        parsedPortfolio = portfolio;
      }
      
      // Initialize if doesn't exist
      if (!currentUser.portfolio) {
        currentUser.portfolio = {};
      }
      
      // Update specific portfolio fields
      if (parsedPortfolio.bio) updateFields['portfolio.bio'] = parsedPortfolio.bio;
      if (parsedPortfolio.about || about) updateFields['portfolio.about'] = parsedPortfolio.about || about;
      
      // Handle work experience
      if (parsedPortfolio.workExperience && Array.isArray(parsedPortfolio.workExperience)) {
        updateFields['portfolio.workExperience'] = parsedPortfolio.workExperience;
      }
      
      // Handle education
      if (parsedPortfolio.education && Array.isArray(parsedPortfolio.education)) {
        updateFields['portfolio.education'] = parsedPortfolio.education;
      }
      
      // Handle languages
      if (parsedPortfolio.languages && Array.isArray(parsedPortfolio.languages)) {
        updateFields['portfolio.languages'] = parsedPortfolio.languages;
      }
      
      // Handle certifications
      if (parsedPortfolio.certifications && Array.isArray(parsedPortfolio.certifications)) {
        updateFields['portfolio.certifications'] = parsedPortfolio.certifications;
      }
      
      // Handle interests
      if (parsedPortfolio.interests && Array.isArray(parsedPortfolio.interests)) {
        updateFields['portfolio.interests'] = parsedPortfolio.interests;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { 
        new: true,
        select: '-password -deviceTokens -security.twoFactorSecret -security.twoFactorBackupCodes'
      }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(updatedUser);
  } catch (error) {
    console.error('Profile update error:', error);
    // Check if it's a multer error
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large. Maximum size is 5MB.' });
    }
    res.status(500).json({ error: 'Error updating profile' });
  }
});
// Get user profile
app.get('/api/users/view/profile', authenticateToken, async (req, res) => {
  try {
    // Redirect to the proper analytics endpoint
    return res.redirect('/api/profile-views/analytics');
  } catch (error) {
    console.error('Profile view redirect error:', error);
    res.status(500).json({ error: 'Error processing request' });
  }
});
app.get('/api/users/:userId/profile', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;
    if (targetUserId === 'view') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    // Check if current user is blocked by target user
    
    
      // Check if userId is a reserved word
   
      
      // Validate userId is a valid ObjectId
      if (!mongoose.isValidObjectId(targetUserId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }
      const targetUser = await User.findById(targetUserId)
      .select('-password -security -deviceTokens');
      
      
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    
    // Check blocking relationship
    if (targetUser.blockedUsers && targetUser.blockedUsers.includes(currentUserId)) {
      return res.status(403).json({ error: 'User not available' });
    }
    
    if (currentUserId !== targetUserId) {
      const currentUser = await User.findById(currentUserId);
      if (currentUser.blockedUsers && currentUser.blockedUsers.includes(targetUserId)) {
        return res.status(403).json({ error: 'You have blocked this user' });
      }
      
      // Increment profile view count
      if (!targetUser.analytics) {
        targetUser.analytics = { profileViews: { count: 0, history: [] } };
      }
      
      targetUser.analytics.profileViews.count++;
      
      // Add to history
      const today = new Date().toISOString().split('T')[0];
      const historyEntry = targetUser.analytics.profileViews.history.find(
        entry => entry.date.toISOString().split('T')[0] === today
      );
      
      if (historyEntry) {
        historyEntry.count++;
      } else {
        targetUser.analytics.profileViews.history.push({
          date: new Date(),
          count: 1
        });
      }
      
      await targetUser.save();
    }
    
    // Get portfolio items
    const projects = await Project.find({
      user: targetUserId,
      $or: [
        { visibility: 'public' },
        { 
          visibility: 'connections',
          user: { $in: targetUser.connections }
        },
        { user: currentUserId }
      ]
    })
    .sort({ featured: -1, updatedAt: -1 })
    .limit(5);
    
    const streaks = await Streak.find({
      user: targetUserId,
      $or: [
        { visibility: 'public' },
        { 
          visibility: 'connections',
          user: { $in: targetUser.connections }
        },
        { user: currentUserId }
      ]
    })
    .sort({ currentStreak: -1 })
    .limit(5);
    
    const achievements = await Achievement.find({
      user: targetUserId,
      $or: [
        { visibility: 'public' },
        { 
          visibility: 'connections',
          user: { $in: targetUser.connections }
        },
        { user: currentUserId }
      ]
    })
    .sort({ featured: -1, dateAchieved: -1 })
    .limit(5);
    
    // Get recommendations
    const recommendations = await Recommendation.find({
      recipient: targetUserId,
      status: 'approved'
    })
    .populate('author', 'firstName lastName profilePicture')
    .sort({ featured: -1, createdAt: -1 });
    
    // Connection status
    const isConnected = targetUser.connections.includes(currentUserId);
    const isPending = targetUser.pendingConnections.includes(currentUserId);
    const isFollowing = targetUser.followers.includes(currentUserId);
    const isFollower = targetUser.following.includes(currentUserId);
    
    res.json({
      user: targetUser,
      portfolio: {
        projects,
        streaks,
        achievements
      },
      recommendations,
      relationshipStatus: {
        isConnected,
        isPending,
        isFollowing,
        isFollower
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Error fetching user profile' });
  }
});

// Location update
app.put('/api/location', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
    );

    const address = response.data.results[0]?.formatted_address || '';

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        location: {
          type: 'Point',
          coordinates: [longitude, latitude],
          address,
          lastUpdated: new Date()
        }
      },
      { new: true }
    );
    res.json(updatedUser);
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ error: 'Error updating location' });
  }
});
// Add this to your server.js file, with your other API routes
app.get('/api/network/nearby', authenticateToken, async (req, res) => {
  try {
    const { distance = 10 } = req.query;
    const currentUser = await User.findById(req.user.id);
    
    if (!currentUser || !currentUser.location || !currentUser.location.coordinates) {
      return res.status(400).json({ error: 'User location not available' });
    }
    
    // Find users within the specified distance
    const nearbyUsers = await User.find({
      _id: { $ne: req.user.id },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: currentUser.location.coordinates
          },
          $maxDistance: parseInt(distance) * 1000 // Convert km to meters
        }
      }
    })
    .select('firstName lastName profilePicture headline industry location')
    .limit(50);
    
    // Add connection status and calculate precise distance
    const results = await Promise.all(
      nearbyUsers.map(async (user) => {
        // Check connection status
        const isConnected = currentUser.connections.includes(user._id);
        const isPending = currentUser.pendingConnections.includes(user._id);
        
        // Calculate distance
        const distance = getDistanceFromLatLonInKm(
          currentUser.location.coordinates[1],
          currentUser.location.coordinates[0],
          user.location.coordinates[1],
          user.location.coordinates[0]
        );
        
        return {
          ...user.toObject(),
          connectionStatus: isConnected ? 'connected' : (isPending ? 'pending' : 'none'),
          distance: parseFloat(distance.toFixed(1))
        };
      })
    );
    
    res.json(results);
  } catch (error) {
    console.error('Get nearby professionals error:', error);
    res.status(500).json({ error: 'Error fetching nearby professionals' });
  }
});

// Helper function to calculate distance
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}
// Privacy settings update
app.put('/api/privacy-settings', authenticateToken, async (req, res) => {
  try {
    const { privacy } = req.body;
    
    if (!privacy) {
      return res.status(400).json({ error: 'Privacy settings are required' });
    }
    
    const updateFields = {};
    
    if (privacy.profileVisibility) {
      updateFields['privacy.profileVisibility'] = privacy.profileVisibility;
    }
    
    if (privacy.storyVisibility) {
      updateFields['privacy.storyVisibility'] = privacy.storyVisibility;
    }
    
    if (privacy.messagePermission) {
      updateFields['privacy.messagePermission'] = privacy.messagePermission;
    }
    
    if (privacy.activityStatus !== undefined) {
      updateFields['privacy.activityStatus'] = privacy.activityStatus;
    }
    
    if (privacy.searchability !== undefined) {
      updateFields['privacy.searchability'] = privacy.searchability;
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true }
    );
    
    res.json({
      privacy: updatedUser.privacy
    });
  } catch (error) {
    console.error('Privacy settings update error:', error);
    res.status(500).json({ error: 'Error updating privacy settings' });
  }
});

// ----------------------
// USER RELATIONSHIP ROUTES
// ----------------------

// Connection request
app.get('/api/network/connection-requests', authenticateToken, async (req, res) => {
  try {
    // Find the current user
    const currentUser = await User.findById(req.user.id);
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get users who have sent connection requests to the current user
    const connectionRequests = await User.find({
      _id: { $in: currentUser.pendingConnections }
    })
    .select('firstName lastName profilePicture headline createdAt')
    .sort('-createdAt');
    
    // Calculate mutual connections
    const result = await Promise.all(connectionRequests.map(async (request) => {
      // Find mutual connections (users who are connected to both parties)
      const mutualConnections = currentUser.connections.filter(connection => 
        request.connections?.includes(connection)
      ).length;
      
      return {
        ...request.toObject(),
        mutualConnections
      };
    }));
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching connection requests:', error);
    res.status(500).json({ error: 'Error fetching connection requests' });
  }
});
app.post('/api/connections/request', authenticateToken, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot connect with yourself' });
    }
    
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if already connected
    if (targetUser.connections.includes(req.user.id)) {
      return res.status(400).json({ error: 'Already connected' });
    }
    
    // Check if request already pending
    if (targetUser.pendingConnections.includes(req.user.id)) {
      return res.status(400).json({ error: 'Connection request already pending' });
    }
    
    // Check if blocked
    if (targetUser.blockedUsers.includes(req.user.id)) {
      return res.status(403).json({ error: 'Cannot send connection request' });
    }
    
    // Add to pending connections
    targetUser.pendingConnections.push(req.user.id);
    await targetUser.save();
    
    // Create notification
    await createNotification({
      recipient: targetUserId,
      sender: req.user.id,
      type: 'connection_request',
      contentType: 'user',
      contentId: req.user.id,
      text: `${req.user.firstName} ${req.user.lastName} sent you a connection request`,
      actionUrl: `/connections/pending`
    });
    
    res.json({ message: 'Connection request sent' });
  } catch (error) {
    console.error('Connection request error:', error);
    res.status(500).json({ error: 'Error sending connection request' });
  }
});
// Add this endpoint to your server code to handle the GET /api/network/connections route

app.get('/api/network/connections', authenticateToken, async (req, res) => {
  try {
    const { type = 'all' } = req.query;
    const currentUser = await User.findById(req.user.id);
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    let userIds = [];
    
    // Filter connections based on type
    if (type === 'all' || type === 'connections') {
      userIds = [...currentUser.connections];
    } else if (type === 'following') {
      userIds = [...currentUser.following];
    } else if (type === 'followers') {
      userIds = [...currentUser.followers];
    }
    
    // Fetch connection users with basic profile information
    const connections = await User.find({ 
      _id: { $in: userIds } 
    })
    .select('firstName lastName profilePicture headline industry')
    .sort('firstName lastName');
    
    // Add relationship context
    const result = connections.map(connection => {
      const isFollowing = currentUser.following.includes(connection._id);
      const isFollower = currentUser.followers.includes(connection._id);
      const isConnected = currentUser.connections.includes(connection._id);
      
      return {
        ...connection.toObject(),
        isFollowing,
        isFollower,
        isConnected
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ error: 'Error fetching connections' });
  }
});
// Accept connection
app.post('/api/connections/accept', authenticateToken, async (req, res) => {
  try {
    const { senderUserId } = req.body;
    
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if request exists
    if (!currentUser.pendingConnections.includes(senderUserId)) {
      return res.status(400).json({ error: 'No pending connection request from this user' });
    }
    
    const senderUser = await User.findById(senderUserId);
    if (!senderUser) {
      return res.status(404).json({ error: 'Sender user not found' });
    }
    
    // Remove from pending
    currentUser.pendingConnections = currentUser.pendingConnections.filter(
      id => id.toString() !== senderUserId
    );
    
    // Add to connections
    currentUser.connections.push(senderUserId);
    senderUser.connections.push(req.user.id);
    
    await Promise.all([currentUser.save(), senderUser.save()]);
    
    // Create notification
    await createNotification({
      recipient: senderUserId,
      sender: req.user.id,
      type: 'connection_accepted',
      contentType: 'user',
      contentId: req.user.id,
      text: `${currentUser.firstName} ${currentUser.lastName} accepted your connection request`,
      actionUrl: `/profile/${req.user.id}`
    });
    
    res.json({ message: 'Connection accepted' });
  } catch (error) {
    console.error('Accept connection error:', error);
    res.status(500).json({ error: 'Error accepting connection' });
  }
});

// Decline connection
app.post('/api/connections/decline', authenticateToken, async (req, res) => {
  try {
    const { senderUserId } = req.body;
    
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove from pending
    currentUser.pendingConnections = currentUser.pendingConnections.filter(
      id => id.toString() !== senderUserId
    );
    
    await currentUser.save();
    
    res.json({ message: 'Connection declined' });
  } catch (error) {
    console.error('Decline connection error:', error);
    res.status(500).json({ error: 'Error declining connection' });
  }
});

// Follow user
app.post('/api/users/:userId/follow', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentUser = await User.findById(req.user.id);
    
    // Check if target user has blocked current user
    if (targetUser.blockedUsers && targetUser.blockedUsers.includes(req.user.id)) {
      return res.status(403).json({ error: 'Unable to follow user' });
    }
    
    const isFollowing = currentUser.following.includes(targetUserId);
    
    if (isFollowing) {
      // Unfollow user
      currentUser.following = currentUser.following.filter(id => 
        id.toString() !== targetUserId
      );
      
      targetUser.followers = targetUser.followers.filter(id => 
        id.toString() !== req.user.id
      );
    } else {
      // Follow user
      currentUser.following.push(targetUserId);
      targetUser.followers.push(req.user.id);
      
      // Create notification for target user
      createNotification({
        recipient: targetUserId,
        sender: req.user.id,
        type: 'follow',
        contentType: 'user',
        contentId: req.user.id,
        text: `${currentUser.firstName} ${currentUser.lastName} started following you`,
        actionUrl: `/profile/${req.user.id}`
      });
    }
    
    await Promise.all([currentUser.save(), targetUser.save()]);
    
    res.json({
      following: !isFollowing,
      followerCount: targetUser.followers.length,
      followingCount: currentUser.following.length
    });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ error: 'Error updating follow status' });
  }
});
// Add this endpoint to your server code to handle the GET /api/network/suggestions route

app.get('/api/network/suggestions', authenticateToken, async (req, res) => {
  try {
    const { industry, skills, limit = 20 } = req.query;
    const currentUser = await User.findById(req.user.id);
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Build the query to find relevant users
    let query = {
      _id: { $ne: currentUser._id }, // Exclude current user
      // Exclude users that are already connected or blocked
      _id: { 
        $nin: [
          ...currentUser.connections || [], 
          ...currentUser.blockedUsers || [],
          ...currentUser.pendingConnections || []
        ] 
      }
    };
    
    // Add industry filter if specified
    if (industry) {
      query.industry = industry;
    } else if (currentUser.industry) {
      // Use current user's industry as a fallback
      query.industry = currentUser.industry;
    }
    
    // Add skills filter if specified
    if (skills) {
      const skillsArray = skills.split(',');
      query['skills.name'] = { $in: skillsArray };
    }
    
    // Find users matching the criteria
    const suggestions = await User.find(query)
      .select('firstName lastName profilePicture headline industry skills')
      .limit(parseInt(limit));
    
    // Add context about the relationship with each user
    const result = suggestions.map(user => {
      const isFollowing = currentUser.following && currentUser.following.includes(user._id);
      const isFollower = currentUser.followers && currentUser.followers.includes(user._id);
      
      // Calculate number of mutual connections
      const mutualConnections = user.connections ? 
        user.connections.filter(connectionId => 
          currentUser.connections && currentUser.connections.includes(connectionId)
        ).length : 0;
      
      return {
        ...user.toObject(),
        isFollowing,
        isFollower,
        mutualConnections,
        connectionStatus: 'none'
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: 'Error fetching suggested professionals' });
  }
});
// Block user
app.post('/api/users/:userId/block', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }
    
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentUser = await User.findById(req.user.id);
    
    const isBlocked = currentUser.blockedUsers.includes(targetUserId);
    
    if (isBlocked) {
      // Unblock user
      currentUser.blockedUsers = currentUser.blockedUsers.filter(id => 
        id.toString() !== targetUserId
      );
    } else {
      // Block user
      currentUser.blockedUsers.push(targetUserId);
      
      // Remove from connections, followers, following
      currentUser.connections = currentUser.connections.filter(id => 
        id.toString() !== targetUserId
      );
      
      currentUser.followers = currentUser.followers.filter(id => 
        id.toString() !== targetUserId
      );
      
      currentUser.following = currentUser.following.filter(id => 
        id.toString() !== targetUserId
      );
      
      // Remove from target user's connections, followers, following
      targetUser.connections = targetUser.connections.filter(id => 
        id.toString() !== req.user.id
      );
      
      targetUser.followers = targetUser.followers.filter(id => 
        id.toString() !== req.user.id
      );
      
      targetUser.following = targetUser.following.filter(id => 
        id.toString() !== req.user.id
      );
    }
    
    await Promise.all([currentUser.save(), targetUser.save()]);
    
    res.json({
      blocked: !isBlocked
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Error updating block status' });
  }
});
// ----------------------
// ENHANCED MAP-BASED NETWORKING
// ----------------------

// Get professionals in radius with advanced filtering
app.get('/api/network/map', authenticateToken, async (req, res) => {
  try {
    const {
      latitude, longitude, radius = 10, // km
      industries = [], skills = [], 
      availableForMeeting = false,
      availableForHiring = false,
      lookingForWork = false,
      page = 1, limit = 50
    } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }
    
    // Parse arrays from query strings
    const industriesArray = typeof industries === 'string' ? industries.split(',') : industries;
    const skillsArray = typeof skills === 'string' ? skills.split(',') : skills;
    
    // Find users who are nearby and match filters
    let query = {
      _id: { $ne: req.user.id }, // Exclude current user
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(radius) * 1000 // Convert km to meters
        }
      }
    };
    
    // Add industry filter
    if (industriesArray.length > 0) {
      query.industry = { $in: industriesArray };
    }
    
    // Add skills filter
    if (skillsArray.length > 0) {
      query['skills.name'] = { $in: skillsArray };
    }
    
    // Availability filters
    if (availableForMeeting === 'true') {
      query['availableForMeeting'] = true;
    }
    
    if (availableForHiring === 'true') {
      query['availableForHiring'] = true;
    }
    
    if (lookingForWork === 'true') {
      query['lookingForWork'] = true;
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute query
    const users = await User.find(query)
      .select('firstName lastName profilePicture headline industry skills location online lastActive availableForMeeting availableForHiring lookingForWork')
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const total = await User.countDocuments(query);
    
    // Calculate distance and check connection status for each user
    const currentUser = await User.findById(req.user.id);
    const enhancedUsers = users.map(user => {
      // Calculate distance
      const distance = getDistanceFromLatLonInKm(
        parseFloat(latitude),
        parseFloat(longitude),
        user.location.coordinates[1],
        user.location.coordinates[0]
      );
      
      // Check connection status
      const isConnected = currentUser.connections.includes(user._id);
      const isPending = currentUser.pendingConnections.includes(user._id);
      const isFollowing = currentUser.following.includes(user._id);
      
      // Enhance user object
      return {
        ...user.toObject(),
        distance: parseFloat(distance.toFixed(2)),
        connectionStatus: {
          isConnected,
          isPending, 
          isFollowing
        }
      };
    });
    
    res.json({
      users: enhancedUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Map-based networking error:', error);
    res.status(500).json({ error: 'Error fetching nearby professionals' });
  }
});

// Update user's real-time location and availability status
app.put('/api/network/location-status', authenticateToken, async (req, res) => {
  try {
    const { 
      latitude, longitude, address,
      availableForMeeting, availableForHiring,
      lookingForWork, visibilityDuration
    } = req.body;
    
    // Validate coordinates
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }
    
    const updateData = {
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
        address: address || '',
        lastUpdated: new Date()
      }
    };
    
    // Update availability flags if provided
    if (availableForMeeting !== undefined) {
      updateData.availableForMeeting = availableForMeeting;
    }
    
    if (availableForHiring !== undefined) {
      updateData.availableForHiring = availableForHiring;
    }
    
    if (lookingForWork !== undefined) {
      updateData.lookingForWork = lookingForWork;
    }
    
    // Set expiration for availability if duration provided
    if (visibilityDuration) {
      const duration = parseInt(visibilityDuration); // in hours
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + duration);
      
      updateData.availabilityExpiresAt = expiresAt;
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    );
    
    // Notify connected users if status changed
    if (availableForMeeting !== undefined || 
        availableForHiring !== undefined || 
        lookingForWork !== undefined) {
      // Emit to socket connections
      io.to(`user_${req.user.id}`).emit('availability_updated', {
        userId: req.user.id,
        availableForMeeting: updatedUser.availableForMeeting,
        availableForHiring: updatedUser.availableForHiring,
        lookingForWork: updatedUser.lookingForWork
      });
    }
    
    res.json({
      success: true,
      location: updatedUser.location,
      availability: {
        availableForMeeting: updatedUser.availableForMeeting,
        availableForHiring: updatedUser.availableForHiring,
        lookingForWork: updatedUser.lookingForWork,
        expiresAt: updatedUser.availabilityExpiresAt
      }
    });
  } catch (error) {
    console.error('Location-status update error:', error);
    res.status(500).json({ error: 'Error updating location and status' });
  }
});

// Request in-person meeting
app.post('/api/network/meeting-request', authenticateToken, async (req, res) => {
  try {
    const { 
      targetUserId, 
      proposedTime, // ISO datetime string
      proposedLocation, // { name, address, coordinates: [lng, lat] }
      message,
      duration // in minutes
    } = req.body;
    
    // Validate target user
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if target user is available for meetings
    if (!targetUser.availableForMeeting) {
      return res.status(400).json({ error: 'User is not available for meetings' });
    }
    
    // Create meeting request
    const meeting = await Meeting.create({
      requester: req.user.id,
      recipient: targetUserId,
      status: 'pending',
      proposedTime: new Date(proposedTime),
      proposedLocation,
      message,
      duration: duration || 30, // default to 30 minutes
      createdAt: new Date()
    });
    
    // Create notification
    const user = await User.findById(req.user.id)
      .select('firstName lastName profilePicture');
      
    await createNotification({
      recipient: targetUserId,
      sender: req.user.id,
      type: 'meeting_request',
      contentType: 'meeting',
      contentId: meeting._id,
      text: `${user.firstName} ${user.lastName} wants to meet with you`,
      actionUrl: `/meetings/${meeting._id}`
    });
    
    // Notify via socket if user is online
    io.to(`user_${targetUserId}`).emit('meeting_request', {
      meeting,
      from: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture
      }
    });
    
    res.status(201).json({
      success: true,
      meeting
    });
  } catch (error) {
    console.error('Meeting request error:', error);
    res.status(500).json({ error: 'Error creating meeting request' });
  }
});

// Respond to meeting request
app.put('/api/network/meeting-request/:meetingId', authenticateToken, async (req, res) => {
  try {
    const { status, alternativeTime, alternativeLocation, message } = req.body;
    
    if (!['accepted', 'declined', 'rescheduled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Find meeting and verify recipient
    const meeting = await Meeting.findById(req.params.meetingId);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting request not found' });
    }
    
    if (meeting.recipient.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to respond to this meeting request' });
    }
    
    // Update meeting
    const updateData = { status };
    
    if (status === 'rescheduled') {
      if (!alternativeTime) {
        return res.status(400).json({ error: 'Alternative time required for rescheduling' });
      }
      
      updateData.alternativeTime = new Date(alternativeTime);
      updateData.alternativeLocation = alternativeLocation;
      updateData.recipientMessage = message;
    }
    
    const updatedMeeting = await Meeting.findByIdAndUpdate(
      req.params.meetingId,
      updateData,
      { new: true }
    );
    
    // Notify requester
    const user = await User.findById(req.user.id)
      .select('firstName lastName profilePicture');
      
    let notificationType, notificationText;
    
    switch(status) {
      case 'accepted':
        notificationType = 'meeting_accepted';
        notificationText = `${user.firstName} ${user.lastName} accepted your meeting request`;
        break;
      case 'declined':
        notificationType = 'meeting_declined';
        notificationText = `${user.firstName} ${user.lastName} declined your meeting request`;
        break;
      case 'rescheduled':
        notificationType = 'meeting_rescheduled';
        notificationText = `${user.firstName} ${user.lastName} proposed a new time for your meeting`;
        break;
    }
    
    await createNotification({
      recipient: meeting.requester,
      sender: req.user.id,
      type: notificationType,
      contentType: 'meeting',
      contentId: meeting._id,
      text: notificationText,
      actionUrl: `/meetings/${meeting._id}`
    });
    
    // Notify via socket
    io.to(`user_${meeting.requester}`).emit('meeting_response', {
      meetingId: meeting._id,
      status,
      responder: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
    
    res.json({
      success: true,
      meeting: updatedMeeting
    });
  } catch (error) {
    console.error('Meeting response error:', error);
    res.status(500).json({ error: 'Error responding to meeting request' });
  }
});

// Get user's meetings
app.get('/api/network/meetings', authenticateToken, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {
      $or: [
        { requester: req.user.id },
        { recipient: req.user.id }
      ]
    };
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by type (sent/received)
    if (type === 'sent') {
      query = { requester: req.user.id };
    } else if (type === 'received') {
      query = { recipient: req.user.id };
    }
    
    // Execute query
    const meetings = await Meeting.find(query)
      .populate('requester', 'firstName lastName profilePicture headline')
      .populate('recipient', 'firstName lastName profilePicture headline')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const total = await Meeting.countDocuments(query);
    
    res.json({
      meetings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get meetings error:', error);
    res.status(500).json({ error: 'Error fetching meetings' });
  }
});

// ----------------------
// ENHANCED EVENT MANAGEMENT
// ----------------------

// Create recurrent events
app.post('/api/events/recurrent', authenticateToken, upload.single('coverImage'), async (req, res) => {
  try {
    const {
      title, description, eventType, category, tags,
      startDate, endDate, location, privacy,
      recurrencePattern, // daily, weekly, monthly, custom
      daysOfWeek, // [0,1,4] (for weekly, 0=Sunday)
      daysOfMonth, // [1,15] (for monthly)
      monthsOfYear, // [0,6] (for yearly, 0=January)
      interval, // every X days/weeks/months
      until // end date for recurrence
    } = req.body;
    
    // Validate recurrence data
    if (!recurrencePattern) {
      return res.status(400).json({ error: 'Recurrence pattern is required' });
    }
    
    // Process location
    let locationData = {};
    if (typeof location === 'string') {
      try {
        locationData = JSON.parse(location);
      } catch (e) {
        locationData = { address: location };
      }
    } else if (typeof location === 'object') {
      locationData = location;
    }
    
    // Calculate recurrence dates
    let recurrenceDates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const untilDate = until ? new Date(until) : new Date();
    untilDate.setFullYear(untilDate.getFullYear() + 1); // Default to 1 year if not specified
    
    const eventDuration = end - start; // in milliseconds
    
    switch (recurrencePattern) {
      case 'daily':
        for (let date = new Date(start); date <= untilDate; date.setDate(date.getDate() + (interval || 1))) {
          recurrenceDates.push({
            startDate: new Date(date),
            endDate: new Date(date.getTime() + eventDuration)
          });
        }
        break;
        
      case 'weekly':
        const weekdays = daysOfWeek ? JSON.parse(daysOfWeek) : [start.getDay()];
        for (let date = new Date(start); date <= untilDate; date.setDate(date.getDate() + 1)) {
          if (weekdays.includes(date.getDay())) {
            recurrenceDates.push({
              startDate: new Date(date),
              endDate: new Date(date.getTime() + eventDuration)
            });
          }
          
          // Skip to next week if we've processed all days of current week
          if (date.getDay() === 6 && (interval || 1) > 1) {
            date.setDate(date.getDate() + (7 * ((interval || 1) - 1)));
          }
        }
        break;
        
      case 'monthly':
        const monthDays = daysOfMonth ? JSON.parse(daysOfMonth) : [start.getDate()];
        for (let date = new Date(start); date <= untilDate;) {
          const currentMonth = date.getMonth();
          
          // Check each day in monthDays
          for (const day of monthDays) {
            const specificDate = new Date(date);
            specificDate.setDate(day);
            
            // If valid date and not before start date
            if (specificDate.getMonth() === currentMonth && specificDate >= start) {
              recurrenceDates.push({
                startDate: new Date(specificDate),
                endDate: new Date(specificDate.getTime() + eventDuration)
              });
            }
          }
          
          // Move to next month
          date.setMonth(date.getMonth() + (interval || 1));
          date.setDate(1); // Reset to first day of month
        }
        break;
        
      case 'yearly':
        const months = monthsOfYear ? JSON.parse(monthsOfYear) : [start.getMonth()];
        for (let year = start.getFullYear(); year <= untilDate.getFullYear(); year += (interval || 1)) {
          for (const month of months) {
            const specificDate = new Date(year, month, start.getDate());
            
            // If not before start date
            if (specificDate >= start) {
              recurrenceDates.push({
                startDate: new Date(specificDate),
                endDate: new Date(specificDate.getTime() + eventDuration)
              });
            }
          }
        }
        break;
    }
    
    // Limit to reasonable number
    if (recurrenceDates.length > 100) {
      recurrenceDates = recurrenceDates.slice(0, 100);
    }
    
    // Create base event
    const baseEvent = {
      creator: req.user.id,
      title,
      description,
      eventType,
      category,
      tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
      location: locationData,
      coverImage: req.file ? req.file.path : null,
      privacy,
      attendees: [{ user: req.user.id, status: 'going' }],
      recurrencePattern,
      recurrenceSettings: {
        pattern: recurrencePattern,
        daysOfWeek: daysOfWeek ? JSON.parse(daysOfWeek) : null,
        daysOfMonth: daysOfMonth ? JSON.parse(daysOfMonth) : null,
        monthsOfYear: monthsOfYear ? JSON.parse(monthsOfYear) : null,
        interval: interval ? parseInt(interval) : 1,
        until: untilDate
      }
    };
    
    // Create series ID
    const seriesId = new mongoose.Types.ObjectId();
    
    // Create events for each recurrence date
    const events = [];
    for (const [index, dates] of recurrenceDates.entries()) {
      const event = await Event.create({
        ...baseEvent,
        startDate: dates.startDate,
        endDate: dates.endDate,
        seriesId: seriesId,
        isRecurring: true,
        recurrenceIndex: index
      });
      
      events.push(event);
    }
    
    // Update hashtags if provided
    if (tags) {
      const tagsArray = typeof tags === 'string' ? tags.split(',') : tags;
      await updateHashtags(tagsArray, 'event');
    }
    
    // Return just the first event with metadata about the series
    const firstEvent = await Event.findById(events[0]._id)
      .populate('creator', 'firstName lastName profilePicture');
    
    res.status(201).json({
      event: firstEvent,
      recurrenceSeries: {
        seriesId: seriesId,
        pattern: recurrencePattern,
        totalEvents: events.length
      }
    });
  } catch (error) {
    console.error('Create recurrent event error:', error);
    res.status(500).json({ error: 'Error creating recurrent event' });
  }
});

// Respond to event invitation
app.post('/api/events/:eventId/respond', authenticateToken, async (req, res) => {
  try {
    const { status, message } = req.body;
    
    if (!['going', 'interested', 'not-going'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if already responded
    const existingResponse = event.attendees.find(
      attendee => attendee.user.toString() === req.user.id
    );
    
    if (existingResponse) {
      // Update existing response
      existingResponse.status = status;
      existingResponse.message = message;
      existingResponse.updatedAt = new Date();
    } else {
      // Add new response
      event.attendees.push({
        user: req.user.id,
        status,
        message,
        respondedAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    await event.save();
    
    // Notify event creator if not the user
    if (event.creator.toString() !== req.user.id) {
      const user = await User.findById(req.user.id)
        .select('firstName lastName profilePicture');
        
      let notificationText;
      switch(status) {
        case 'going':
          notificationText = `${user.firstName} ${user.lastName} is attending your event`;
          break;
        case 'interested':
          notificationText = `${user.firstName} ${user.lastName} is interested in your event`;
          break;
        case 'not-going':
          notificationText = `${user.firstName} ${user.lastName} declined your event`;
          break;
      }
      
      await createNotification({
        recipient: event.creator,
        sender: req.user.id,
        type: 'event_rsvp',
        contentType: 'event',
        contentId: event._id,
        text: notificationText,
        actionUrl: `/events/${event._id}`
      });
    }
    
    // Populate updated event with attendee info
    const updatedEvent = await Event.findById(event._id)
      .populate('creator', 'firstName lastName profilePicture')
      .populate('attendees.user', 'firstName lastName profilePicture');
    
    res.json({
      success: true,
      event: updatedEvent,
      userStatus: status
    });
  } catch (error) {
    console.error('Event response error:', error);
    res.status(500).json({ error: 'Error responding to event' });
  }
});

// Get event attendees with pagination and filtering
app.get('/api/events/:eventId/attendees', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Filter attendees by status
    let attendeeIds = event.attendees;
    if (status) {
      attendeeIds = event.attendees.filter(
        attendee => attendee.status === status
      );
    }
    
    // Extract just the user IDs
    const userIds = attendeeIds.map(attendee => attendee.user);
    
    // Build user query
    let userQuery = {
      _id: { $in: userIds }
    };
    
    // Add search filter if provided
    if (search) {
      userQuery.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { headline: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get users with pagination
    const users = await User.find(userQuery)
      .select('firstName lastName profilePicture headline industry')
      .skip(skip)
      .limit(parseInt(limit));
      
    // Get total count
    const total = await User.countDocuments(userQuery);
    
    // Combine user info with attendance info
    const attendees = users.map(user => {
      const attendeeInfo = event.attendees.find(
        attendee => attendee.user.toString() === user._id.toString()
      );
      
      return {
        user,
        status: attendeeInfo.status,
        message: attendeeInfo.message,
        respondedAt: attendeeInfo.respondedAt,
        updatedAt: attendeeInfo.updatedAt
      };
    });
    
    res.json({
      attendees,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get event attendees error:', error);
    res.status(500).json({ error: 'Error fetching event attendees' });
  }
});

// Send event invitation to connections
app.post('/api/events/:eventId/invite', authenticateToken, async (req, res) => {
  try {
    const { userIds, message } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs are required' });
    }
    
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if user is the creator or going to the event
    const isCreator = event.creator.toString() === req.user.id;
    const isAttending = event.attendees.some(
      attendee => attendee.user.toString() === req.user.id && attendee.status === 'going'
    );
    
    if (!isCreator && !isAttending) {
      return res.status(403).json({ 
        error: 'Only the event creator or attendees can send invitations' 
      });
    }
    
    // Validate invitees
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id firstName lastName');
      
    if (users.length === 0) {
      return res.status(404).json({ error: 'No valid users found' });
    }
    
    // Track successful invites
    const invitedUsers = [];
    const currentUser = await User.findById(req.user.id)
      .select('firstName lastName');
    
    // Send invitations
    for (const user of users) {
      // Check if already invited or attending
      const alreadyInvited = event.invitations && event.invitations.some(
        invite => invite.user.toString() === user._id.toString()
      );
      
      const alreadyAttending = event.attendees.some(
        attendee => attendee.user.toString() === user._id.toString()
      );
      
      if (!alreadyInvited && !alreadyAttending) {
        // Add to event invitations
        if (!event.invitations) {
          event.invitations = [];
        }
        
        event.invitations.push({
          user: user._id,
          invitedBy: req.user.id,
          message,
          invitedAt: new Date()
        });
        
        // Create notification
        await createNotification({
          recipient: user._id,
          sender: req.user.id,
          type: 'event_invite',
          contentType: 'event',
          contentId: event._id,
          text: `${currentUser.firstName} ${currentUser.lastName} invited you to an event: ${event.title}`,
          actionUrl: `/events/${event._id}`
        });
        
        invitedUsers.push(user);
      }
    }
    
    await event.save();
    
    res.json({
      success: true,
      invitedUsers,
      event: {
        _id: event._id,
        title: event.title
      }
    });
  } catch (error) {
    console.error('Event invitation error:', error);
    res.status(500).json({ error: 'Error sending event invitations' });
  }
});

// Check in to event (with location verification)
app.post('/api/events/:eventId/checkin', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, checkInCode } = req.body;
    
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Verify check-in code if provided by event
    if (event.checkInCode && event.checkInCode !== checkInCode) {
      return res.status(403).json({ error: 'Invalid check-in code' });
    }
    
    // Verify event is currently happening
    const now = new Date();
    if (now < event.startDate || now > event.endDate) {
      return res.status(400).json({ 
        error: 'Check-in only available during the event',
        eventTime: {
          start: event.startDate,
          end: event.endDate,
          current: now
        }
      });
    }
    
    // Verify location if coordinates provided
    if (latitude && longitude && event.location && event.location.coordinates) {
      // Calculate distance between user and event
      const distance = getDistanceFromLatLonInKm(
        parseFloat(latitude),
        parseFloat(longitude),
        event.location.coordinates[1],
        event.location.coordinates[0]
      );
      
      // Allow check-in if within 100m of event location
      if (distance > 0.1) {
        return res.status(400).json({ 
          error: 'You must be at the event location to check in',
          distance: distance,
          unit: 'km',
          threshold: 0.1
        });
      }
    }
    
    // Find attendee entry
    const attendeeIndex = event.attendees.findIndex(
      attendee => attendee.user.toString() === req.user.id
    );
    
    if (attendeeIndex === -1) {
      // Not in attendee list, add them with going status
      event.attendees.push({
        user: req.user.id,
        status: 'going',
        checkedIn: true,
        checkInTime: new Date()
      });
    } else {
      // Update existing attendee
      event.attendees[attendeeIndex].checkedIn = true;
      event.attendees[attendeeIndex].checkInTime = new Date();
    }
    
    await event.save();
    
    // Record this in activity history
    await ActivityLog.create({
      user: req.user.id,
      activityType: 'event_checkin',
      entityId: event._id,
      entityType: 'event',
      metadata: {
        eventTitle: event.title,
        location: {
          latitude,
          longitude
        }
      }
    });
    
    res.json({
      success: true,
      checkedIn: true,
      checkInTime: new Date()
    });
  } catch (error) {
    console.error('Event check-in error:', error);
    res.status(500).json({ error: 'Error checking in to event' });
  }
});

// Event analytics for organizers
app.get('/api/events/:eventId/analytics', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if user is the creator
    if (event.creator.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only the event creator can view analytics' });
    }
    
    // Calculate attendance stats
    const totalResponses = event.attendees.length;
    const goingCount = event.attendees.filter(a => a.status === 'going').length;
    const interestedCount = event.attendees.filter(a => a.status === 'interested').length;
    const notGoingCount = event.attendees.filter(a => a.status === 'not-going').length;
    const checkedInCount = event.attendees.filter(a => a.checkedIn).length;
    
    // Calculate response rate from invitations
    const invitationCount = event.invitations ? event.invitations.length : 0;
    const responseRate = invitationCount > 0 
      ? Math.round((totalResponses / invitationCount) * 100) 
      : 0;
    
    // Get views count (if tracked)
    const viewsCount = event.views || 0;
    
    // Get check-in rate
    const checkInRate = goingCount > 0 
      ? Math.round((checkedInCount / goingCount) * 100) 
      : 0;
    
    res.json({
      attendance: {
        going: goingCount,
        interested: interestedCount,
        notGoing: notGoingCount,
        checkedIn: checkedInCount,
        total: totalResponses
      },
      engagement: {
        invitations: invitationCount,
        responseRate: responseRate,
        views: viewsCount,
        checkInRate: checkInRate
      },
      demographics: {
        // Add demographic info if tracked
      }
    });
  } catch (error) {
    console.error('Event analytics error:', error);
    res.status(500).json({ error: 'Error fetching event analytics' });
  }
});

// ----------------------
// ENHANCED CONTENT & INTERACTION SYSTEM
// ----------------------

// Advanced content filters based on interest and relevance
app.get('/api/content/feed', authenticateToken, async (req, res) => {
  try {
    const { 
      type = 'all',    // posts, events, jobs, projects
      filter = 'recommended', // recent, popular, connections, following
      page = 1, 
      limit = 10,
      location = false // include location-based content
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const user = await User.findById(req.user.id);
    
    // Build base query based on type and filters
    let contentQueries = [];
    let locationFilter = {};
    
    // Add location filter if requested
    if (location === 'true' && user.location && user.location.coordinates) {
      locationFilter = {
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: user.location.coordinates
            },
            $maxDistance: 50000 // 50km radius
          }
        }
      };
    }
    
    // Determine content sources based on type
    if (type === 'all' || type === 'posts') {
      // Build post query
      let postQuery = {};
      
      if (filter === 'connections') {
        postQuery.author = { $in: user.connections || [] };
      } else if (filter === 'following') {
        postQuery.author = { $in: user.following || [] };
      } else if (filter === 'popular') {
        // Sort by engagement later
      }
      
      // Privacy filter for posts
      postQuery.$or = [
        { visibility: 'public' },
        { visibility: 'connections', author: { $in: user.connections || [] } },
        { author: req.user.id }
      ];
      
      // Add location filter if applicable
      if (Object.keys(locationFilter).length > 0) {
        postQuery = { ...postQuery, ...locationFilter };
      }
      
      contentQueries.push({
        model: Post,
        query: postQuery,
        populate: [
          { path: 'author', select: 'firstName lastName profilePicture headline' },
          { path: 'likes.user', select: 'firstName lastName profilePicture' }
        ],
        type: 'post',
        sortBy: filter === 'popular' ? { 'likes.length': -1 } : { createdAt: -1 }
      });
    }
    
    if (type === 'all' || type === 'events') {
      // Build event query
      let eventQuery = {
        startDate: { $gte: new Date() } // Only upcoming events
      };
      
      if (filter === 'connections') {
        eventQuery.creator = { $in: user.connections || [] };
      } else if (filter === 'following') {
        eventQuery.creator = { $in: user.following || [] };
      } else if (filter === 'popular') {
        // Sort by attendance later
      }
      
      // Privacy filter for events
      eventQuery.$or = [
        { privacy: 'public' },
        { privacy: 'connections', creator: { $in: user.connections || [] } },
        { creator: req.user.id }
      ];
      
      // Add location filter if applicable
      if (Object.keys(locationFilter).length > 0) {
        eventQuery = { ...eventQuery, ...locationFilter };
      }
      
      contentQueries.push({
        model: Event,
        query: eventQuery,
        populate: [
          { path: 'creator', select: 'firstName lastName profilePicture headline' }
        ],
        type: 'event',
        sortBy: filter === 'popular' ? { 'attendees.length': -1 } : { startDate: 1 }
      });
    }
    
    if (type === 'all' || type === 'jobs') {
      // Build job query
      let jobQuery = {
        active: true
      };
      
      if (filter === 'recommended') {
        // Add skills filter for better recommendation
        if (user.skills && user.skills.length > 0) {
          const userSkills = user.skills.map(s => s.name);
          jobQuery.skills = { $in: userSkills };
        }
        
        if (user.industry) {
          jobQuery.industry = user.industry;
        }
      } else if (filter === 'connections') {
        jobQuery.creator = { $in: user.connections || [] };
      }
      
      // Add location filter if applicable
      if (Object.keys(locationFilter).length > 0) {
        jobQuery = { ...jobQuery, ...locationFilter };
      }
      
      contentQueries.push({
        model: Job,
        query: jobQuery,
        populate: [
          { path: 'creator', select: 'firstName lastName profilePicture headline' }
        ],
        type: 'job',
        sortBy: { createdAt: -1 }
      });
    }
    
    if (type === 'all' || type === 'projects') {
      // Build projects query
      let projectQuery = {};
      
      if (filter === 'connections') {
        projectQuery.user = { $in: user.connections || [] };
      } else if (filter === 'following') {
        projectQuery.user = { $in: user.following || [] };
      }
      
      // Privacy filter for projects
      projectQuery.$or = [
        { visibility: 'public' },
        { visibility: 'connections', user: { $in: user.connections || [] } },
        { user: req.user.id }
      ];
      
      contentQueries.push({
        model: Project,
        query: projectQuery,
        populate: [
          { path: 'user', select: 'firstName lastName profilePicture headline' }
        ],
        type: 'project',
        sortBy: { updatedAt: -1 }
      });
    }
    
    // Execute queries and combine results
    const contentResults = await Promise.all(
      contentQueries.map(async ({ model, query, populate, type, sortBy }) => {
        try {
          const items = await model.find(query)
            .populate(populate)
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit));
            
          const count = await model.countDocuments(query);
          
          return {
            type,
            items,
            count
          };
        } catch (err) {
          console.error(`Error fetching ${type} content:`, err);
          return {
            type,
            items: [],
            count: 0,
            error: err.message
          };
        }
      })
    );
    
    // Combine results and sort by date/relevance
    const combinedResults = contentResults
      .flatMap(result => result.items.map(item => ({
        ...item.toObject(),
        contentType: result.type
      })))
      .sort((a, b) => {
        const dateA = a.startDate || a.createdAt || a.updatedAt;
        const dateB = b.startDate || b.createdAt || b.updatedAt;
        return new Date(dateB) - new Date(dateA);
      });
    
    // Calculate total across all content types
    const totalItems = contentResults.reduce((sum, result) => sum + result.count, 0);
    
    res.json({
      content: combinedResults.slice(0, limit),
      contentTypes: contentResults.map(r => ({ type: r.type, count: r.count })),
      pagination: {
        total: totalItems,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalItems / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Content feed error:', error);
    res.status(500).json({ error: 'Error fetching content feed' });
  }
});

// Advanced search with filters
app.get('/api/search', authenticateToken, async (req, res) => {
  try {
    const {
      query,
      type = 'all', // users, posts, events, jobs, projects, companies
      filter = {},
      page = 1,
      limit = 20
    } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Parse filters if provided as string
    let parsedFilter = filter;
    if (typeof filter === 'string') {
      try {
        parsedFilter = JSON.parse(filter);
      } catch (e) {
        parsedFilter = {};
      }
    }
    
    // Build search query based on content type
    let searchResults;
    let totalCount = 0;
    
    if (type === 'all' || type === 'users') {
      // User search
      const userQuery = {
        $or: [
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { headline: { $regex: query, $options: 'i' } },
          { 'skills.name': { $regex: query, $options: 'i' } }
        ],
        _id: { $ne: req.user.id } // Exclude current user
      };
      
      // Add industry filter
      if (parsedFilter.industry) {
        userQuery.industry = parsedFilter.industry;
      }
      
      // Add location filter
      if (parsedFilter.location) {
        userQuery['location.address'] = { $regex: parsedFilter.location, $options: 'i' };
      }
      
      // Add skills filter
      if (parsedFilter.skills && Array.isArray(parsedFilter.skills)) {
        userQuery['skills.name'] = { $in: parsedFilter.skills };
      }
      
      const users = await User.find(userQuery)
        .select('firstName lastName profilePicture headline industry skills location')
        .skip(type === 'users' ? skip : 0)
        .limit(type === 'users' ? parseInt(limit) : 5);
        
      const userCount = await User.countDocuments(userQuery);
      totalCount += userCount;
      
      if (!searchResults) searchResults = {};
      searchResults.users = {
        items: users,
        count: userCount
      };
    }
    
    if (type === 'all' || type === 'posts') {
      // Post search
      const postQuery = {
        $or: [
          { content: { $regex: query, $options: 'i' } },
          { tags: { $regex: query, $options: 'i' } }
        ],
        // Only show posts the user has permission to see
        $or: [
          { visibility: 'public' },
          { visibility: 'connections', author: { $in: (await User.findById(req.user.id)).connections || [] } },
          { author: req.user.id }
        ]
      };
      
      // Add date range filter
      if (parsedFilter.dateFrom) {
        if (!postQuery.createdAt) postQuery.createdAt = {};
        postQuery.createdAt.$gte = new Date(parsedFilter.dateFrom);
      }
      
      if (parsedFilter.dateTo) {
        if (!postQuery.createdAt) postQuery.createdAt = {};
        postQuery.createdAt.$lte = new Date(parsedFilter.dateTo);
      }
      
      const posts = await Post.find(postQuery)
        .populate('author', 'firstName lastName profilePicture headline')
        .sort({ createdAt: -1 })
        .skip(type === 'posts' ? skip : 0)
        .limit(type === 'posts' ? parseInt(limit) : 5);
        
      const postCount = await Post.countDocuments(postQuery);
      totalCount += postCount;
      
      if (!searchResults) searchResults = {};
      searchResults.posts = {
        items: posts,
        count: postCount
      };
    }
    
    if (type === 'all' || type === 'events') {
      // Event search
      const eventQuery = {
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } },
          { tags: { $regex: query, $options: 'i' } }
        ],
        // Filter to respect privacy settings
        $or: [
          { privacy: 'public' },
          { privacy: 'connections', creator: { $in: (await User.findById(req.user.id)).connections || [] } },
          { creator: req.user.id }
        ]
      };
      
      // Only upcoming events by default
      if (!parsedFilter.includePastEvents) {
        eventQuery.startDate = { $gte: new Date() };
      }
      
      // Add date range filter
      if (parsedFilter.dateFrom) {
        if (!eventQuery.startDate) eventQuery.startDate = {};
        eventQuery.startDate.$gte = new Date(parsedFilter.dateFrom);
      }
      
      if (parsedFilter.dateTo) {
        if (!eventQuery.endDate) eventQuery.endDate = {};
        eventQuery.endDate.$lte = new Date(parsedFilter.dateTo);
      }
      
      // Add category filter
      if (parsedFilter.category) {
        eventQuery.category = parsedFilter.category;
      }
      
      // Add location filter
      if (parsedFilter.location) {
        eventQuery['location.address'] = { $regex: parsedFilter.location, $options: 'i' };
      }
      
      const events = await Event.find(eventQuery)
        .populate('creator', 'firstName lastName profilePicture headline')
        .sort({ startDate: 1 })
        .skip(type === 'events' ? skip : 0)
        .limit(type === 'events' ? parseInt(limit) : 5);
        
      const eventCount = await Event.countDocuments(eventQuery);
      totalCount += eventCount;
      
      if (!searchResults) searchResults = {};
      searchResults.events = {
        items: events,
        count: eventCount
      };
    }
    
    if (type === 'all' || type === 'jobs') {
      // Job search
      const jobQuery = {
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { skills: { $regex: query, $options: 'i' } },
          { industry: { $regex: query, $options: 'i' } }
        ],
        active: true
      };
      
      // Add job type filter
      if (parsedFilter.jobType) {
        jobQuery.jobType = parsedFilter.jobType;
      }
      
      // Add location filter
      if (parsedFilter.location) {
        jobQuery['location.city'] = { $regex: parsedFilter.location, $options: 'i' };
      }
      
      // Add salary range filter
      if (parsedFilter.salaryMin) {
        if (!jobQuery['salary.min']) jobQuery['salary.min'] = {};
        jobQuery['salary.min'].$gte = parseInt(parsedFilter.salaryMin);
      }
      
      if (parsedFilter.salaryMax) {
        if (!jobQuery['salary.max']) jobQuery['salary.max'] = {};
        jobQuery['salary.max'].$lte = parseInt(parsedFilter.salaryMax);
      }
      
      // Add experience level filter
      if (parsedFilter.experienceLevel) {
        jobQuery.experienceLevel = parsedFilter.experienceLevel;
      }
      
      const jobs = await Job.find(jobQuery)
        .populate('creator', 'firstName lastName profilePicture headline')
        .sort({ createdAt: -1 })
        .skip(type === 'jobs' ? skip : 0)
        .limit(type === 'jobs' ? parseInt(limit) : 5);
        
      const jobCount = await Job.countDocuments(jobQuery);
      totalCount += jobCount;
      
      if (!searchResults) searchResults = {};
      searchResults.jobs = {
        items: jobs,
        count: jobCount
      };
    }
    
    if (type === 'all' || type === 'companies') {
      // Company search
      const companyQuery = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { industry: { $regex: query, $options: 'i' } }
        ]
      };
      
      // Add industry filter
      if (parsedFilter.industry) {
        companyQuery.industry = parsedFilter.industry;
      }
      
      // Add size filter
      if (parsedFilter.size) {
        companyQuery.size = parsedFilter.size;
      }
      
      // Add location filter
      if (parsedFilter.location) {
        companyQuery['headquarters.city'] = { $regex: parsedFilter.location, $options: 'i' };
      }
      
      const companies = await Company.find(companyQuery)
        .sort({ name: 1 })
        .skip(type === 'companies' ? skip : 0)
        .limit(type === 'companies' ? parseInt(limit) : 5);
        
      const companyCount = await Company.countDocuments(companyQuery);
      totalCount += companyCount;
      
      if (!searchResults) searchResults = {};
      searchResults.companies = {
        items: companies,
        count: companyCount
      };
    }
    
    res.json({
      query,
      results: searchResults,
      totalResults: totalCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Error performing search' });
  }
});

// Trending topics and hashtags
app.get('/api/trending', authenticateToken, async (req, res) => {
  try {
    const { period = 'day', category, location } = req.query;
    
    // Determine time range based on period
    const now = new Date();
    let since = new Date();
    
    switch (period) {
      case 'hour':
        since.setHours(since.getHours() - 1);
        break;
      case 'day':
        since.setDate(since.getDate() - 1);
        break;
      case 'week':
        since.setDate(since.getDate() - 7);
        break;
      case 'month':
        since.setMonth(since.getMonth() - 1);
        break;
    }
    
    // Build base query for content created within time period
    const timeQuery = { createdAt: { $gte: since, $lte: now } };
    
    // Build location query if provided
    let locationQuery = {};
    if (location) {
      // If location is coordinates
      if (location.includes(',')) {
        const [lat, lng] = location.split(',').map(parseFloat);
        locationQuery = {
          'location.coordinates': {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [lng, lat]
              },
              $maxDistance: 50000 // 50km radius
            }
          }
        };
      } else {
        // If location is text
        locationQuery = {
          $or: [
            { 'location.address': { $regex: location, $options: 'i' } },
            { 'location.city': { $regex: location, $options: 'i' } },
            { 'location.country': { $regex: location, $options: 'i' } }
          ]
        };
      }
    }
    
    // Build category query if provided
    let categoryQuery = {};
    if (category) {
      categoryQuery = { category };
    }
    
    // Get trending hashtags
    const trendingHashtags = await Hashtag.find({ trending: true })
      .sort({ postCount: -1, eventCount: -1, jobCount: -1 })
      .limit(10);
    
    // Get trending posts
    const trendingPosts = await Post.aggregate([
      { $match: { ...timeQuery, ...locationQuery, ...categoryQuery } },
      { $addFields: { engagementScore: { $add: [
        { $size: '$likes' },
        { $multiply: [{ $size: '$comments' }, 2] },
        { $multiply: ['$shareCount', 3] }
      ] } } },
      { $sort: { engagementScore: -1 } },
      { $limit: 5 },
      { $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        as: 'author'
      } },
      { $unwind: '$author' },
      { $project: {
        _id: 1,
        content: 1,
        type: 1,
        images: 1,
        videos: 1,
        engagementScore: 1,
        createdAt: 1,
        'author._id': 1,
        'author.firstName': 1,
        'author.lastName': 1,
        'author.profilePicture': 1
      } }
    ]);
    
    // Get trending events
    const trendingEvents = await Event.aggregate([
      { $match: { ...timeQuery, ...locationQuery, ...categoryQuery } },
      { $addFields: { attendeeCount: { $size: '$attendees' } } },
      { $sort: { attendeeCount: -1 } },
      { $limit: 5 },
      { $lookup: {
        from: 'users',
        localField: 'creator',
        foreignField: '_id',
        as: 'creator'
      } },
      { $unwind: '$creator' },
      { $project: {
        _id: 1,
        title: 1,
        description: 1,
        eventType: 1,
        category: 1,
        startDate: 1,
        endDate: 1,
        location: 1,
        attendeeCount: 1,
        'creator._id': 1,
        'creator.firstName': 1,
        'creator.lastName': 1,
        'creator.profilePicture': 1
      } }
    ]);
    
    // Get active discussions (posts with most comments)
    const activeDiscussions = await Post.aggregate([
      { $match: { ...timeQuery, ...locationQuery } },
      { $addFields: { commentCount: { $size: '$comments' } } },
      { $sort: { commentCount: -1 } },
      { $limit: 5 },
      { $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        as: 'author'
      } },
      { $unwind: '$author' },
      { $project: {
        _id: 1,
        content: 1,
        commentCount: 1,
        createdAt: 1,
        'author._id': 1,
        'author.firstName': 1,
        'author.lastName': 1,
        'author.profilePicture': 1
      } }
    ]);
    
    res.json({
      trendingHashtags,
      trendingPosts,
      trendingEvents,
      activeDiscussions,
      period,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Trending content error:', error);
    res.status(500).json({ error: 'Error fetching trending content' });
  }
});

// ----------------------
// PROFILE ENHANCEMENT ENDPOINTS
// ----------------------

// Skills endorsement system
app.post('/api/users/:userId/endorse', authenticateToken, async (req, res) => {
  try {
    const { skillName } = req.body;
    
    if (!skillName) {
      return res.status(400).json({ error: 'Skill name is required' });
    }
    
    // Verify user exists
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is endorsing themselves
    if (targetUser._id.toString() === req.user.id) {
      return res.status(400).json({ error: 'You cannot endorse your own skills' });
    }
    
    // Find the skill
    const skillIndex = targetUser.skills.findIndex(
      skill => skill.name.toLowerCase() === skillName.toLowerCase()
    );
    
    if (skillIndex === -1) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    // Check if user has already endorsed this skill
    if (!targetUser.skills[skillIndex].endorsements) {
      targetUser.skills[skillIndex].endorsements = 0;
    }
    
    if (!targetUser.skills[skillIndex].endorsedBy) {
      targetUser.skills[skillIndex].endorsedBy = [];
    }
    
    const alreadyEndorsed = targetUser.skills[skillIndex].endorsedBy.some(
      id => id.toString() === req.user.id
    );
    
    if (alreadyEndorsed) {
      // Remove endorsement (toggle)
      targetUser.skills[skillIndex].endorsements--;
      targetUser.skills[skillIndex].endorsedBy = targetUser.skills[skillIndex].endorsedBy.filter(
        id => id.toString() !== req.user.id
      );
    } else {
      // Add endorsement
      targetUser.skills[skillIndex].endorsements++;
      targetUser.skills[skillIndex].endorsedBy.push(req.user.id);
      
      // Create notification
      const currentUser = await User.findById(req.user.id)
        .select('firstName lastName');
        
      await createNotification({
        recipient: targetUser._id,
        sender: req.user.id,
        type: 'endorsement',
        contentType: 'skill',
        contentId: targetUser._id,
        text: `${currentUser.firstName} ${currentUser.lastName} endorsed you for ${skillName}`,
        actionUrl: `/profile/${targetUser._id}`
      });
    }
    
    // Sort skills by endorsement count (descending)
    targetUser.skills.sort((a, b) => (b.endorsements || 0) - (a.endorsements || 0));
    
    await targetUser.save();
    
    res.json({
      success: true,
      skill: targetUser.skills[skillIndex],
      endorsed: !alreadyEndorsed
    });
  }  catch (error) {
    console.error('Skill endorsement error:', error);
    res.status(500).json({ error: 'Error endorsing skill' });
  }
});

// Recommendation system
app.post('/api/users/:userId/recommend', authenticateToken, async (req, res) => {
  try {
    const { relationship, content, skills } = req.body;
    
    if (!relationship || !content) {
      return res.status(400).json({ error: 'Relationship and content are required' });
    }
    
    // Check if target user exists
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is trying to recommend themselves
    if (targetUser._id.toString() === req.user.id) {
      return res.status(400).json({ error: 'You cannot write a recommendation for yourself' });
    }
    
    // Check if already recommended
    const existingRecommendation = await Recommendation.findOne({
      author: req.user.id,
      recipient: targetUser._id
    });
    
    if (existingRecommendation) {
      return res.status(400).json({ 
        error: 'You have already recommended this user',
        recommendation: existingRecommendation
      });
    }
    
    // Create the recommendation (pending approval by recipient)
    const recommendation = await Recommendation.create({
      author: req.user.id,
      recipient: targetUser._id,
      relationship,
      content,
      skills: skills || [],
      status: 'pending',
      createdAt: new Date()
    });
    
    // Notify recipient
    const currentUser = await User.findById(req.user.id)
      .select('firstName lastName profilePicture');
      
    await createNotification({
      recipient: targetUser._id,
      sender: req.user.id,
      type: 'recommendation',
      contentType: 'recommendation',
      contentId: recommendation._id,
      text: `${currentUser.firstName} ${currentUser.lastName} wrote you a recommendation`,
      actionUrl: `/recommendations/${recommendation._id}`
    });
    
    // Return with author details
    const populatedRecommendation = await Recommendation.findById(recommendation._id)
      .populate('author', 'firstName lastName profilePicture headline');
    
    res.status(201).json(populatedRecommendation);
  } catch (error) {
    console.error('Recommendation creation error:', error);
    res.status(500).json({ error: 'Error creating recommendation' });
  }
});

// Manage pending recommendations (approve, decline, edit)
app.put('/api/recommendations/:recommendationId', authenticateToken, async (req, res) => {
  try {
    const { status, featured, content } = req.body;
    
    const recommendation = await Recommendation.findById(req.params.recommendationId);
    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    // Check permissions - recipient can approve/decline/feature, author can edit content
    const isRecipient = recommendation.recipient.toString() === req.user.id;
    const isAuthor = recommendation.author.toString() === req.user.id;
    
    if (!isRecipient && !isAuthor) {
      return res.status(403).json({ error: 'Not authorized to modify this recommendation' });
    }
    
    // Handle status changes (recipient only)
    if (status && isRecipient) {
      if (!['approved', 'declined', 'hidden'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      recommendation.status = status;
    }
    
    // Handle featuring (recipient only)
    if (featured !== undefined && isRecipient) {
      recommendation.featured = Boolean(featured);
    }
    
    // Handle content update (author only, and only if pending)
    if (content && isAuthor && recommendation.status === 'pending') {
      recommendation.content = content;
      recommendation.updatedAt = new Date();
    }
    
    await recommendation.save();
    
    // If status changed to approved, notify author
    if (status === 'approved' && isRecipient) {
      const recipient = await User.findById(req.user.id)
        .select('firstName lastName');
        
      await createNotification({
        recipient: recommendation.author,
        sender: req.user.id,
        type: 'recommendation_approved',
        contentType: 'recommendation',
        contentId: recommendation._id,
        text: `${recipient.firstName} ${recipient.lastName} approved your recommendation`,
        actionUrl: `/profile/${recommendation.recipient}`
      });
    }
    
    // Return populated recommendation
    const populatedRecommendation = await Recommendation.findById(recommendation._id)
      .populate('author', 'firstName lastName profilePicture headline')
      .populate('recipient', 'firstName lastName profilePicture headline');
    
    res.json(populatedRecommendation);
  } catch (error) {
    console.error('Recommendation update error:', error);
    res.status(500).json({ error: 'Error updating recommendation' });
  }
});

// ----------------------
// GROUPS & COMMUNITIES
// ----------------------

// Create group/community
app.post('/api/groups', authenticateToken, upload.single('coverImage'), async (req, res) => {
  try {
    const {
      name, description, type, category, tags,
      isPrivate, requiresApproval, location
    } = req.body;
    
    if (!name || !description || !type) {
      return res.status(400).json({ error: 'Name, description and type are required' });
    }
    
    // Process location if provided
    let locationData = {};
    if (location) {
      try {
        locationData = typeof location === 'string' ? JSON.parse(location) : location;
      } catch (e) {
        console.error('Error parsing location:', e);
        locationData = {};
      }
    }
    
    // Create group
    const group = await Group.create({
      name,
      description,
      type, // professional, interest, location-based, alumni, etc.
      category,
      tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
      coverImage: req.file ? req.file.path : null,
      isPrivate: isPrivate === 'true' || isPrivate === true,
      requiresApproval: requiresApproval === 'true' || requiresApproval === true,
      location: locationData,
      creator: req.user.id,
      admins: [req.user.id],
      members: [{ 
        user: req.user.id, 
        role: 'admin', 
        joinedAt: new Date() 
      }],
      createdAt: new Date()
    });
    
    // Update hashtags if there are tags
    if (tags) {
      const tagsArray = typeof tags === 'string' ? tags.split(',') : tags;
      await updateHashtags(tagsArray, 'group');
    }
    
    // Return populated group
    const populatedGroup = await Group.findById(group._id)
      .populate('creator', 'firstName lastName profilePicture headline')
      .populate('members.user', 'firstName lastName profilePicture headline');
    
    res.status(201).json(populatedGroup);
  } catch (error) {
    console.error('Group creation error:', error);
    res.status(500).json({ error: 'Error creating group' });
  }
});

// Join, leave, or request to join group
app.post('/api/groups/:groupId/membership', authenticateToken, async (req, res) => {
  try {
    const { action, message } = req.body;
    
    if (!['join', 'leave', 'request'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user is already a member
    const isMember = group.members.some(member => 
      member.user.toString() === req.user.id
    );
    
    // Check if user has a pending request
    const hasPendingRequest = group.membershipRequests && group.membershipRequests.some(
      request => request.user.toString() === req.user.id && request.status === 'pending'
    );
    
    if (action === 'join') {
      if (isMember) {
        return res.status(400).json({ error: 'Already a member of this group' });
      }
      
      if (hasPendingRequest) {
        return res.status(400).json({ error: 'You already have a pending request to join' });
      }
      
      // If group requires approval, create request
      if (group.requiresApproval) {
        if (!group.membershipRequests) {
          group.membershipRequests = [];
        }
        
        group.membershipRequests.push({
          user: req.user.id,
          message: message || '',
          requestedAt: new Date(),
          status: 'pending'
        });
        
        // Notify group admins
        for (const member of group.members.filter(m => m.role === 'admin')) {
          await createNotification({
            recipient: member.user,
            sender: req.user.id,
            type: 'group_join_request',
            contentType: 'group',
            contentId: group._id,
            text: `${(await User.findById(req.user.id)).firstName} ${(await User.findById(req.user.id)).lastName} requested to join ${group.name}`,
            actionUrl: `/groups/${group._id}/requests`
          });
        }
        
        await group.save();
        
        return res.json({
          success: true,
          status: 'pending',
          message: 'Join request submitted and pending approval'
        });
      } 
      // No approval required, join directly
      else {
        group.members.push({
          user: req.user.id,
          role: 'member',
          joinedAt: new Date()
        });
        
        await group.save();
        
        return res.json({
          success: true,
          status: 'joined',
          message: 'Successfully joined group'
        });
      }
    }
    else if (action === 'leave') {
      if (!isMember) {
        return res.status(400).json({ error: 'Not a member of this group' });
      }
      
      // Check if user is the only admin
      const isAdmin = group.members.some(member => 
        member.user.toString() === req.user.id && member.role === 'admin'
      );
      
      const adminCount = group.members.filter(member => member.role === 'admin').length;
      
      if (isAdmin && adminCount === 1) {
        return res.status(400).json({ 
          error: 'Cannot leave group as you are the only admin. Transfer admin role first or delete the group.' 
        });
      }
      
      // Remove user from members
      group.members = group.members.filter(member => 
        member.user.toString() !== req.user.id
      );
      
      await group.save();
      
      return res.json({
        success: true,
        status: 'left',
        message: 'Successfully left group'
      });
    }
    else if (action === 'request') {
      if (isMember) {
        return res.status(400).json({ error: 'Already a member of this group' });
      }
      
      if (hasPendingRequest) {
        return res.status(400).json({ error: 'You already have a pending request to join' });
      }
      
      if (!group.membershipRequests) {
        group.membershipRequests = [];
      }
      
      group.membershipRequests.push({
        user: req.user.id,
        message: message || '',
        requestedAt: new Date(),
        status: 'pending'
      });
      
      // Notify group admins
      for (const member of group.members.filter(m => m.role === 'admin')) {
        await createNotification({
          recipient: member.user,
          sender: req.user.id,
          type: 'group_join_request',
          contentType: 'group',
          contentId: group._id,
          text: `${(await User.findById(req.user.id)).firstName} ${(await User.findById(req.user.id)).lastName} requested to join ${group.name}`,
          actionUrl: `/groups/${group._id}/requests`
        });
      }
      
      await group.save();
      
      return res.json({
        success: true,
        status: 'pending',
        message: 'Join request submitted and pending approval'
      });
    }
  } catch (error) {
    console.error('Group membership action error:', error);
    res.status(500).json({ error: 'Error processing group membership action' });
  }
});

// Review membership requests (for admins)
app.put('/api/groups/:groupId/requests/:userId', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user is an admin
    const isAdmin = group.members.some(member => 
      member.user.toString() === req.user.id && member.role === 'admin'
    );
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only group admins can review membership requests' });
    }
    
    // Find the request
    if (!group.membershipRequests) {
      return res.status(404).json({ error: 'No membership requests found' });
    }
    
    const requestIndex = group.membershipRequests.findIndex(
      request => request.user.toString() === req.params.userId && request.status === 'pending'
    );
    
    if (requestIndex === -1) {
      return res.status(404).json({ error: 'Membership request not found' });
    }
    
    // Update request status
    group.membershipRequests[requestIndex].status = status;
    group.membershipRequests[requestIndex].reviewedBy = req.user.id;
    group.membershipRequests[requestIndex].reviewedAt = new Date();
    
    // If approved, add user to members
    if (status === 'approved') {
      group.members.push({
        user: group.membershipRequests[requestIndex].user,
        role: 'member',
        joinedAt: new Date()
      });
    }
    
    await group.save();
    
    // Notify the requester
    const requester = await User.findById(req.params.userId);
    const reviewer = await User.findById(req.user.id);
    
    await createNotification({
      recipient: req.params.userId,
      sender: req.user.id,
      type: status === 'approved' ? 'group_request_approved' : 'group_request_rejected',
      contentType: 'group',
      contentId: group._id,
      text: status === 'approved' 
        ? `Your request to join ${group.name} was approved` 
        : `Your request to join ${group.name} was declined`,
      actionUrl: `/groups/${group._id}`
    });
    
    res.json({
      success: true,
      status,
      request: group.membershipRequests[requestIndex]
    });
  } catch (error) {
    console.error('Review membership request error:', error);
    res.status(500).json({ error: 'Error reviewing membership request' });
  }
});

// Create group post
app.post('/api/groups/:groupId/posts', authenticateToken, upload.array('media', 10), async (req, res) => {
  try {
    const {
      content,
      type,
      pollData,
      linkUrl
    } = req.body;
    
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user is a member
    const isMember = group.members.some(member => 
      member.user.toString() === req.user.id
    );
    
    if (!isMember) {
      return res.status(403).json({ error: 'Only group members can create posts' });
    }
    
    // Determine post type
    let postType = type || 'text';
    if (!type) {
      if (req.files && req.files.length > 0) {
        postType = req.files[0].mimetype.startsWith('image/') ? 'image' : 'video';
      } else if (linkUrl) {
        postType = 'link';
      } else if (pollData) {
        postType = 'poll';
      }
    }
    
    // Process media files
    let images = [];
    let videos = [];
    
    if (req.files && req.files.length > 0) {
      req.files.forEach((file, index) => {
        if (file.mimetype.startsWith('image/')) {
          images.push({
            url: file.path,
            order: index
          });
        } else if (file.mimetype.startsWith('video/')) {
          videos.push({
            url: file.path,
            thumbnail: ''
          });
        }
      });
    }
    
    // Process poll data if provided
    let processedPollData = null;
    if (pollData) {
      try {
        const parsed = typeof pollData === 'string' ? JSON.parse(pollData) : pollData;
        
        if (parsed.question && parsed.options && Array.isArray(parsed.options)) {
          processedPollData = {
            question: parsed.question,
            options: parsed.options.map(option => ({
              text: option,
              votes: []
            })),
            expiresAt: parsed.expiresAt 
              ? new Date(parsed.expiresAt) 
              : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 1 week
            allowMultipleVotes: parsed.allowMultipleVotes || false
          };
        }
      } catch (error) {
        console.error('Error parsing poll data:', error);
      }
    }
    
    // Create group post
    const post = await GroupPost.create({
      group: group._id,
      author: req.user.id,
      content: content || '',
      type: postType,
      images,
      videos,
      pollData: processedPollData,
      linkUrl,
      createdAt: new Date()
    });
    
    // Populate and return
    const populatedPost = await GroupPost.findById(post._id)
      .populate('author', 'firstName lastName profilePicture headline')
      .populate('group', 'name');
    
    // Notify group members (optional - could be too noisy for large groups)
    if (group.members.length < 100) { // Only for smaller groups
      for (const member of group.members) {
        if (member.user.toString() !== req.user.id) { // Don't notify the author
          await createNotification({
            recipient: member.user,
            sender: req.user.id,
            type: 'group_post',
            contentType: 'group_post',
            contentId: post._id,
            text: `${(await User.findById(req.user.id)).firstName} posted in ${group.name}`,
            actionUrl: `/groups/${group._id}/posts/${post._id}`
          });
        }
      }
    }
    
    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Group post creation error:', error);
    res.status(500).json({ error: 'Error creating group post' });
  }
});

// ----------------------
// ADVANCED MAP NETWORKING FEATURES
// ----------------------

// Get nearby events
app.get('/api/map/events', authenticateToken, async (req, res) => {
  try {
    const { 
      latitude, longitude, radius = 10, // km
      startDate, endDate, categories = [],
      page = 1, limit = 20
    } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(radius) * 1000 // Convert km to meters
        }
      },
      // Only show events the user has permission to see
      $or: [
        { privacy: 'public' },
        { privacy: 'connections', creator: { $in: (await User.findById(req.user.id)).connections || [] } },
        { creator: req.user.id }
      ],
      // Default to upcoming events
      startDate: { $gte: new Date() }
    };
    
    // Add date filters if provided
    if (startDate) {
      query.startDate = { $gte: new Date(startDate) };
    }
    
    if (endDate) {
      query.endDate = { $lte: new Date(endDate) };
    }
    
    // Add category filter if provided
    if (categories.length > 0) {
      const categoriesArray = typeof categories === 'string' ? categories.split(',') : categories;
      query.category = { $in: categoriesArray };
    }
    
    // Execute query
    const events = await Event.find(query)
      .populate('creator', 'firstName lastName profilePicture headline')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    // Get total count
    const total = await Event.countDocuments(query);
    
    // Add distance calculation
    const eventsWithDistance = events.map(event => {
      let distance = 0;
      
      if (event.location && event.location.coordinates) {
        distance = getDistanceFromLatLonInKm(
          parseFloat(latitude),
          parseFloat(longitude),
          event.location.coordinates[1],
          event.location.coordinates[0]
        );
      }
      
      // Add attendance status
      const userAttendance = event.attendees.find(a => a.user.toString() === req.user.id);
      
      return {
        ...event.toObject(),
        distance: parseFloat(distance.toFixed(2)),
        userAttendance: userAttendance ? userAttendance.status : null
      };
    });
    
    res.json({
      events: eventsWithDistance,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Map events error:', error);
    res.status(500).json({ error: 'Error fetching nearby events' });
  }
});

// Get nearby groups and communities
app.get('/api/map/groups', authenticateToken, async (req, res) => {
  try {
    const { 
      latitude, longitude, radius = 10, // km
      types = [], categories = [],
      page = 1, limit = 20
    } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(radius) * 1000 // Convert km to meters
        }
      },
      // Only show public groups or ones user is a member of
      $or: [
        { isPrivate: false },
        { 'members.user': req.user.id }
      ]
    };
    
    // Add type filter if provided
    if (types.length > 0) {
      const typesArray = typeof types === 'string' ? types.split(',') : types;
      query.type = { $in: typesArray };
    }
    
    // Add category filter if provided
    if (categories.length > 0) {
      const categoriesArray = typeof categories === 'string' ? categories.split(',') : categories;
      query.category = { $in: categoriesArray };
    }
    
    // Execute query
    const groups = await Group.find(query)
      .populate('creator', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    // Get total count
    const total = await Group.countDocuments(query);
    
    // Add distance calculation and membership status
    const groupsWithInfo = groups.map(group => {
      let distance = 0;
      
      if (group.location && group.location.coordinates) {
        distance = getDistanceFromLatLonInKm(
          parseFloat(latitude),
          parseFloat(longitude),
          group.location.coordinates[1],
          group.location.coordinates[0]
        );
      }
      
      const membership = {
        isMember: group.members.some(m => m.user.toString() === req.user.id),
        role: group.members.find(m => m.user.toString() === req.user.id)?.role || null,
        hasPendingRequest: group.membershipRequests?.some(
          r => r.user.toString() === req.user.id && r.status === 'pending'
        ) || false
      };
      
      return {
        ...group.toObject(),
        distance: parseFloat(distance.toFixed(2)),
        memberCount: group.members.length,
        membership
      };
    });
    
    res.json({
      groups: groupsWithInfo,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Map groups error:', error);
    res.status(500).json({ error: 'Error fetching nearby groups' });
  }
});

// Get nearby job opportunities
app.get('/api/map/jobs', authenticateToken, async (req, res) => {
  try {
    const { 
      latitude, longitude, radius = 10, // km
      jobTypes = [], experienceLevels = [], industries = [],
      remote = false, 
      page = 1, limit = 20
    } = req.query;
    
    if (!latitude || !longitude && !remote) {
      return res.status(400).json({ error: 'Location coordinates required for local jobs' });
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {
      active: true
    };
    
    // Add location filter unless looking for remote jobs
    if (remote !== 'true' && remote !== true) {
      query['location.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(radius) * 1000 // Convert km to meters
        }
      };
    } else {
      // For remote jobs, filter by remote flag
      query['location.remote'] = true;
    }
    
    // Add filters
    if (jobTypes.length > 0) {
      const jobTypesArray = typeof jobTypes === 'string' ? jobTypes.split(',') : jobTypes;
      query.jobType = { $in: jobTypesArray };
    }
    
    if (experienceLevels.length > 0) {
      const levelsArray = typeof experienceLevels === 'string' ? experienceLevels.split(',') : experienceLevels;
      query.experienceLevel = { $in: levelsArray };
    }
    
    if (industries.length > 0) {
      const industriesArray = typeof industries === 'string' ? industries.split(',') : industries;
      query.industry = { $in: industriesArray };
    }
    
    // Get user skills for recommendations
    const user = await User.findById(req.user.id);
    const userSkills = user.skills ? user.skills.map(s => s.name) : [];
    
    // Execute query
    const jobs = await Job.find(query)
      .populate('creator', 'firstName lastName profilePicture headline')
      .populate('company.companyId', 'name logo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    // Get total count
    const total = await Job.countDocuments(query);
    
    // Calculate skill match and distance
    const jobsWithInfo = jobs.map(job => {
      let distance = 0;
      let skillMatch = 0;
      
      // Calculate distance if job has coordinates
      if (!remote && job.location && job.location.coordinates) {
        distance = getDistanceFromLatLonInKm(
          parseFloat(latitude),
          parseFloat(longitude),
          job.location.coordinates[1],
          job.location.coordinates[0]
        );
      }
      
      // Calculate skill match percentage
      if (userSkills.length > 0 && job.skills && job.skills.length > 0) {
        const matchingSkills = job.skills.filter(skill => 
          userSkills.includes(skill)
        );
        
        skillMatch = Math.round((matchingSkills.length / job.skills.length) * 100);
      }
      
      return {
        ...job.toObject(),
        distance: parseFloat(distance.toFixed(2)),
        skillMatch
      };
    });
    
    // Sort by skill match if skills available, otherwise keep chronological
    if (userSkills.length > 0) {
      jobsWithInfo.sort((a, b) => b.skillMatch - a.skillMatch);
    }
    
    res.json({
      jobs: jobsWithInfo,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Map jobs error:', error);
    res.status(500).json({ error: 'Error fetching nearby jobs' });
  }
});

// ----------------------
// REAL-TIME LOCATION SHARING AND TRACKING
// ----------------------

// Enable/disable real-time location sharing
app.post('/api/location/continuous-update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, accuracy, heading, speed } = req.body;

    // Validate input
    if (!latitude || !longitude) {
      return res.status(400).json({ msg: 'Latitude and longitude are required' });
    }

    // Update user location
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        'location.coordinates': [longitude, latitude], // GeoJSON format: [lng, lat]
        'location.accuracy': accuracy || null,
        'location.heading': heading || null,
        'location.speed': speed || null,
        'location.lastUpdated': new Date(),
        'location.type': 'Point' // Ensure GeoJSON type is set
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json({ 
      msg: 'Location updated successfully',
      location: updatedUser.location
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});
app.post('/api/location/sharing', authenticateToken, async (req, res) => {
  try {
    const { enabled, duration, visibleTo } = req.body;
    
    // Update user's location sharing settings
    const updateData = {
      'locationSharing.enabled': enabled === true || enabled === 'true'
    };
    
    // Set expiration if duration provided
    if (duration) {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + parseInt(duration));
      updateData['locationSharing.expiresAt'] = expiresAt;
    } else if (enabled) {
      // Default to 1 hour if enabled without duration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      updateData['locationSharing.expiresAt'] = expiresAt;
    }
    
    // Set visibility settings
    if (visibleTo) {
      updateData['locationSharing.visibleTo'] = visibleTo; // 'connections', 'everyone', 'selected'
    }
    
    // If sharing with selected users, update the list
    if (visibleTo === 'selected' && req.body.selectedUsers) {
      let selectedUsers;
      try {
        selectedUsers = typeof req.body.selectedUsers === 'string' 
          ? JSON.parse(req.body.selectedUsers) 
          : req.body.selectedUsers;
      } catch (e) {
        console.error('Error parsing selectedUsers:', e);
        selectedUsers = [];
      }
      
      updateData['locationSharing.selectedUsers'] = selectedUsers;
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true }
    );
    
    // Notify connections if enabled
    if (enabled === true || enabled === 'true') {
      // Get user's connections
      const connectionIds = updatedUser.connections || [];
      
      // Filter based on visibility settings
      let notifyUserIds = [];
      
      if (visibleTo === 'connections') {
        notifyUserIds = connectionIds;
      } else if (visibleTo === 'selected' && updateData['locationSharing.selectedUsers']) {
        notifyUserIds = updateData['locationSharing.selectedUsers'];
      }
      
      // Send notifications
      for (const userId of notifyUserIds) {
        await createNotification({
          recipient: userId,
          sender: req.user.id,
          type: 'location_sharing',
          contentType: 'user',
          contentId: req.user.id,
          text: `${updatedUser.firstName} ${updatedUser.lastName} is sharing their location with you`,
          actionUrl: `/map/users/${req.user.id}`
        });
      }
      
      // Emit socket event for real-time updates
      io.to(notifyUserIds.map(id => `user_${id}`)).emit('location_sharing_enabled', {
        userId: req.user.id,
        name: `${updatedUser.firstName} ${updatedUser.lastName}`,
        expiresAt: updateData['locationSharing.expiresAt']
      });
    }
    
    res.json({
      success: true,
      locationSharing: {
        enabled: updateData['locationSharing.enabled'],
        expiresAt: updateData['locationSharing.expiresAt'],
        visibleTo: updateData['locationSharing.visibleTo'],
        selectedUsers: updateData['locationSharing.selectedUsers']
      }
    });
  } catch (error) {
    console.error('Location sharing settings error:', error);
    res.status(500).json({ error: 'Error updating location sharing settings' });
  }
});

// Update real-time location
app.post('/api/location/update', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, heading, speed } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Coordinates required' });
    }
    
    // Check if user has location sharing enabled
    const user = await User.findById(req.user.id);
    
    if (!user.locationSharing || !user.locationSharing.enabled) {
      return res.status(403).json({ error: 'Location sharing is not enabled' });
    }
    
    // Check if sharing has expired
    if (user.locationSharing.expiresAt && user.locationSharing.expiresAt < new Date()) {
      // Auto-disable expired sharing
      await User.findByIdAndUpdate(req.user.id, {
        $set: { 'locationSharing.enabled': false }
      });
      
      return res.status(403).json({ 
        error: 'Location sharing has expired',
        expired: true
      });
    }
    
    // Update location in database
    const locationUpdate = {
      'location.coordinates': [parseFloat(longitude), parseFloat(latitude)],
      'location.accuracy': accuracy ? parseFloat(accuracy) : undefined,
      'location.heading': heading ? parseFloat(heading) : undefined,
      'location.speed': speed ? parseFloat(speed) : undefined,
      'location.lastUpdated': new Date()
    };
    
    // Only update fields that are provided
    Object.keys(locationUpdate).forEach(key => {
      if (locationUpdate[key] === undefined) {
        delete locationUpdate[key];
      }
    });
    
    await User.findByIdAndUpdate(req.user.id, { $set: locationUpdate });
    
    // Determine which users can see this update
    let visibleToUserIds = [];
    
    if (user.locationSharing.visibleTo === 'connections') {
      visibleToUserIds = user.connections || [];
    } else if (user.locationSharing.visibleTo === 'selected') {
      visibleToUserIds = user.locationSharing.selectedUsers || [];
    }
    
    // Emit socket event with location update
    io.to(visibleToUserIds.map(id => `user_${id}`)).emit('location_update', {
      userId: req.user.id,
      name: `${user.firstName} ${user.lastName}`,
      location: {
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
        accuracy: accuracy ? parseFloat(accuracy) : null,
        heading: heading ? parseFloat(heading) : null,
        speed: speed ? parseFloat(speed) : null,
        lastUpdated: new Date()
      }
    });
    
    res.json({
      success: true,
      location: {
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
        accuracy: accuracy ? parseFloat(accuracy) : null,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ error: 'Error updating location' });
  }
});

// Get users with shared location
app.get('/api/location/shared-users', authenticateToken, async (req, res) => {
  try {
    // Find users who are sharing location with the current user
    const sharedUsers = await User.find({
      $and: [
        { 'locationSharing.enabled': true },
        { 'locationSharing.expiresAt': { $gt: new Date() } },
        { 
          $or: [
            { 
              'locationSharing.visibleTo': 'connections',
              connections: req.user.id
            },
            {
              'locationSharing.visibleTo': 'selected',
              'locationSharing.selectedUsers': req.user.id
            },
            {
              'locationSharing.visibleTo': 'everyone'
            }
          ]
        }
      ]
    })
    .select('firstName lastName profilePicture headline location locationSharing.expiresAt');
    
    // Add connection status and calculate distance from current user
    const currentUser = await User.findById(req.user.id);
    
    const enhancedUsers = sharedUsers.map(user => {
      let distance = null;
      
      // Calculate distance if both users have coordinates
      if (currentUser.location?.coordinates && user.location?.coordinates) {
        distance = getDistanceFromLatLonInKm(
          currentUser.location.coordinates[1],
          currentUser.location.coordinates[0],
          user.location.coordinates[1],
          user.location.coordinates[0]
        );
      }
      
      // Check connection status
      const isConnected = currentUser.connections?.includes(user._id);
      
      return {
        ...user.toObject(),
        distance: distance !== null ? parseFloat(distance.toFixed(2)) : null,
        isConnected,
        sharingExpiresIn: user.locationSharing?.expiresAt
          ? Math.round((user.locationSharing.expiresAt - new Date()) / 60000) // minutes
          : null
      };
    });
    
    res.json({
      users: enhancedUsers,
      currentUserSharing: currentUser.locationSharing?.enabled || false,
      currentUserExpiry: currentUser.locationSharing?.expiresAt
    });
  } catch (error) {
    console.error('Shared users error:', error);
    res.status(500).json({ error: 'Error fetching location-sharing users' });
  }
});

// ----------------------
// ANALYTICS & REPORTS
// ----------------------

// Get personal networking analytics
app.get('/api/analytics/network', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'month' } = req.query;
    
    // Determine date range
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1); // Default to month
    }
    
    // Get current user data
    const user = await User.findById(userId);
    
    // Calculate growth metrics
    const networkSize = (user.connections || []).length;
    const followers = (user.followers || []).length;
    const following = (user.following || []).length;
    
    // Get new connections in time period
    const recentConnections = await ActivityLog.find({
      user: userId,
      activityType: 'connection_added',
      createdAt: { $gte: startDate, $lte: now }
    }).countDocuments();
    
    // Get profile views in time period
    const profileViews = await ProfileView.find({
      profileId: userId,
      viewedAt: { $gte: startDate, $lte: now }
    }).countDocuments();
    
    // Get unique viewers count
    const uniqueViewers = await ProfileView.aggregate([
      { 
        $match: { 
          profileId: new mongoose.Types.ObjectId(userId),
          viewedAt: { $gte: startDate, $lte: now }
        } 
      },
      { $group: { _id: '$viewerId', count: { $sum: 1 } } },
      { $count: 'total' }
    ]);
    
    const uniqueViewersCount = uniqueViewers.length > 0 ? uniqueViewers[0].total : 0;
    
    // Get event attendance
    const eventsAttended = await Event.find({
      'attendees.user': userId,
      'attendees.status': 'going',
      startDate: { $gte: startDate, $lte: now }
    }).countDocuments();
    
    // Get top skills by endorsements
    const topSkills = user.skills
      ? user.skills
          .filter(skill => skill.endorsements && skill.endorsements > 0)
          .sort((a, b) => b.endorsements - a.endorsements)
          .slice(0, 5)
      : [];
    
    // Get connection industries breakdown
    const connectionIndustries = await User.aggregate([
      { $match: { _id: { $in: user.connections.map(id => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: '$industry', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    res.json({
      networkSize,
      followers,
      following,
      growth: {
        newConnections: recentConnections,
        period
      },
      engagement: {
        profileViews,
        uniqueViewers: uniqueViewersCount,
        eventsAttended
      },
      topSkills: topSkills.map(skill => ({
        name: skill.name,
        endorsements: skill.endorsements
      })),
      industries: connectionIndustries.map(industry => ({
        name: industry._id || 'Not specified',
        count: industry.count
      }))
    });
  } catch (error) {
    console.error('Network analytics error:', error);
    res.status(500).json({ error: 'Error fetching network analytics' });
  }
});

// Get event analytics (for organizers)
app.get('/api/analytics/events', authenticateToken, async (req, res) => {
  try {
    const { period = 'year' } = req.query;
    
    // Determine date range
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setFullYear(startDate.getFullYear() - 1); // Default to year
    }
    
    // Find events created by the user
    const events = await Event.find({
      creator: req.user.id,
      createdAt: { $gte: startDate, $lte: now }
    });
    
    // Calculate metrics
    const totalEvents = events.length;
    const upcomingEvents = events.filter(e => e.startDate > now).length;
    const pastEvents = events.filter(e => e.endDate < now).length;
    
    // Total attendees
    const totalAttendees = events.reduce((sum, event) => 
      sum + event.attendees.filter(a => a.status === 'going').length, 
    0);
    
    // Average attendees per event
    const avgAttendees = pastEvents > 0 
      ? Math.round(events
          .filter(e => e.endDate < now)
          .reduce((sum, event) => 
            sum + event.attendees.filter(a => a.status === 'going').length, 
          0) / pastEvents)
      : 0;
    
    // Check-in rate
    const checkedInTotal = events
      .filter(e => e.endDate < now)
      .reduce((sum, event) => 
        sum + event.attendees.filter(a => a.checkedIn).length, 
      0);
      
    const goingTotal = events
      .filter(e => e.endDate < now)
      .reduce((sum, event) => 
        sum + event.attendees.filter(a => a.status === 'going').length, 
      0);
    
    const checkInRate = goingTotal > 0 
      ? Math.round((checkedInTotal / goingTotal) * 100) 
      : 0;
    
    // Popular categories
    const categoryCounts = {};
    events.forEach(event => {
      if (!categoryCounts[event.category]) {
        categoryCounts[event.category] = 0;
      }
      categoryCounts[event.category]++;
    });
    
    const popularCategories = Object.entries(categoryCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Monthly event counts
    const monthlyEventCounts = [];
    const months = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= now) {
      const month = currentDate.toLocaleString('default', { month: 'short' });
      const year = currentDate.getFullYear();
      const label = `${month} ${year}`;
      
      const monthStart = new Date(currentDate);
      const monthEnd = new Date(currentDate);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      
      const count = events.filter(e => 
        e.startDate >= monthStart && e.startDate < monthEnd
      ).length;
      
      monthlyEventCounts.push({ month: label, count });
      
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    res.json({
      eventCounts: {
        total: totalEvents,
        upcoming: upcomingEvents,
        past: pastEvents
      },
      attendance: {
        total: totalAttendees,
        average: avgAttendees,
        checkInRate: `${checkInRate}%`
      },
      categories: popularCategories,
      trending: {
        mostAttended: events
          .sort((a, b) => 
            b.attendees.filter(at => at.status === 'going').length - 
            a.attendees.filter(at => at.status === 'going').length
          )
          .slice(0, 3)
          .map(e => ({
            id: e._id,
            title: e.title,
            attendees: e.attendees.filter(a => a.status === 'going').length,
            date: e.startDate
          }))
      },
      timeAnalysis: monthlyEventCounts
    });
  } catch (error) {
    console.error('Event analytics error:', error);
    res.status(500).json({ error: 'Error fetching event analytics' });
  }
});

// ----------------------
// APPLICATION CONFIGURATION & PREFERENCES
// ----------------------

// Get personalized app settings
app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('privacy notificationPreferences');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user preferences and default values if not set
    const settings = {
      privacy: user.privacy || {
        profileVisibility: 'public',
        storyVisibility: 'followers',
        messagePermission: 'everyone',
        activityStatus: 'everyone',
        searchability: true
      },
      notifications: user.notificationPreferences || {
        email: {
          messages: true,
          connections: true,
          mentions: true,
          events: true,
          jobs: true,
          marketing: false
        },
        push: {
          messages: true,
          connections: true,
          mentions: true,
          events: true,
          jobs: true
        },
        inApp: {
          messages: true,
          connections: true,
          mentions: true,
          events: true,
          jobs: true
        }
      },
      theme: 'light', // Example of app preference outside user model
      language: 'en',
      accessibility: {
        fontSize: 'medium',
        highContrast: false,
        reduceAnimations: false
      }
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ error: 'Error fetching settings' });
  }
});

// Update app settings
app.put('/api/settings', authenticateToken, async (req, res) => {
  try {
    const { privacy, notifications, theme, language, accessibility } = req.body;
    
    const updateData = {};
    
    // Update privacy settings if provided
    if (privacy) {
      updateData.privacy = {};
      
      if (privacy.profileVisibility) {
        updateData.privacy.profileVisibility = privacy.profileVisibility;
      }
      
      if (privacy.storyVisibility) {
        updateData.privacy.storyVisibility = privacy.storyVisibility;
      }
      
      if (privacy.messagePermission) {
        updateData.privacy.messagePermission = privacy.messagePermission;
      }
      
      if (privacy.activityStatus !== undefined) {
        updateData.privacy.activityStatus = privacy.activityStatus;
      }
      
      if (privacy.searchability !== undefined) {
        updateData.privacy.searchability = privacy.searchability;
      }
    }
    
    // Update notification preferences if provided
    if (notifications) {
      updateData.notificationPreferences = {};
      
      if (notifications.email) {
        updateData.notificationPreferences.email = notifications.email;
      }
      
      if (notifications.push) {
        updateData.notificationPreferences.push = notifications.push;
      }
      
      if (notifications.inApp) {
        updateData.notificationPreferences.inApp = notifications.inApp;
      }
    }
    
    // Update user in database
    let user;
    
    if (Object.keys(updateData).length > 0) {
      user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: updateData },
        { new: true }
      ).select('privacy notificationPreferences');
    } else {
      user = await User.findById(req.user.id)
        .select('privacy notificationPreferences');
    }
    
    // Store app preferences in a separate collection or similar
    // This is an example (not implemented in your model)
    const appSettings = {
      theme: theme || 'light',
      language: language || 'en',
      accessibility: accessibility || {
        fontSize: 'medium',
        highContrast: false,
        reduceAnimations: false
      }
    };
    
    // Combine and return all settings
    const combinedSettings = {
      privacy: user.privacy,
      notifications: user.notificationPreferences,
      ...appSettings
    };
    
    res.json(combinedSettings);
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Error updating settings' });
  }
});

// ----------------------
// WEBHOOK INTEGRATIONS
// ----------------------

// Register external webhook
app.post('/api/webhooks', authenticateToken, async (req, res) => {
  try {
    const { url, events, secret } = req.body;
    
    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ 
        error: 'URL and at least one event type are required' 
      });
    }
    
    // Validate URL format
    if (!url.match(/^https?:\/\/.+/)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    // Validate event types
    const validEventTypes = [
      'new_connection', 'new_message', 'event_rsvp', 
      'profile_view', 'job_application', 'meeting_request'
    ];
    
    const invalidEvents = events.filter(event => !validEventTypes.includes(event));
    if (invalidEvents.length > 0) {
      return res.status(400).json({ 
        error: `Invalid event types: ${invalidEvents.join(', ')}`,
        validEventTypes
      });
    }
    
    // Generate webhook ID and signing secret if not provided
    const webhookId = new mongoose.Types.ObjectId();
    const signingSecret = secret || crypto.randomBytes(16).toString('hex');
    
    // Create webhook
    const webhook = await Webhook.create({
      _id: webhookId,
      user: req.user.id,
      url,
      events,
      signingSecret,
      createdAt: new Date(),
      status: 'active'
    });
    
    res.status(201).json({
      webhookId: webhook._id,
      url: webhook.url,
      events: webhook.events,
      signingSecret,
      status: webhook.status
    });
  } catch (error) {
    console.error('Webhook creation error:', error);
    res.status(500).json({ error: 'Error creating webhook' });
  }
});

// ----------------------
// SCHEMA DEFINITIONS FOR NEW ENDPOINTS
// ----------------------

// Meeting Schema (for in-person networking)
const meetingSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'rescheduled', 'completed', 'canceled'],
    default: 'pending'
  },
  proposedTime: {
    type: Date,
    required: true
  },
  proposedLocation: {
    name: String,
    address: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  alternativeTime: Date,
  alternativeLocation: {
    name: String,
    address: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  duration: {
    type: Number, // in minutes
    default: 30
  },
  message: String,
  recipientMessage: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Group Schema
const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  type: {
    type: String,
    enum: ['professional', 'interest', 'location-based', 'alumni', 'project', 'event', 'other'],
    required: true
  },
  category: String,
  tags: [String],
  coverImage: String,
  isPrivate: {
    type: Boolean,
    default: false
  },
  requiresApproval: {
    type: Boolean,
    default: true
  },
  location: {
    address: String,
    city: String,
    country: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  membershipRequests: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    requestedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Group Post Schema
const groupPostSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: String,
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'link', 'poll'],
    default: 'text'
  },
  images: [{
    url: String,
    caption: String,
    order: Number
  }],
  videos: [{
    url: String,
    thumbnail: String
  }],
  linkUrl: String,
  pollData: {
    question: String,
    options: [{
      text: String,
      votes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }],
    expiresAt: Date,
    allowMultipleVotes: Boolean
  },
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date
  }
});

// Activity Log Schema
const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  activityType: {
    type: String,
    enum: [
      'connection_added', 'connection_removed', 'profile_update',
      'post_created', 'post_liked', 'post_commented',
      'event_created', 'event_rsvp', 'event_checkin',
      'job_applied', 'job_posted', 'group_joined',
      'group_post', 'project_created', 'recommendation_given',
      'skill_endorsed', 'location_shared', 'meeting_scheduled'
    ],
    required: true
  },
  entityType: {
    type: String,
    enum: [
      'user', 'post', 'comment', 'event', 'job', 'group',
      'project', 'skill', 'recommendation', 'meeting', 'location'
    ],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: String,
  userAgent: String
});

// Webhook Schema
const webhookSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  url: {
    type: String,
    required: true
  },
  events: [{
    type: String,
    enum: [
      'new_connection', 'new_message', 'event_rsvp', 
      'profile_view', 'job_application', 'meeting_request',
      'post_created', 'location_update', 'group_join'
    ]
  }],
  signingSecret: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'error'],
    default: 'active'
  },
  lastTriggered: Date,
  errorCount: {
    type: Number,
    default: 0
  },
  lastError: {
    message: String,
    code: String,
    timestamp: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

// Create models for new schemas
const Meeting = mongoose.model('Meeting', meetingSchema);
const Group = mongoose.model('Group', groupSchema);
const GroupPost = mongoose.model('GroupPost', groupPostSchema);
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
const Webhook = mongoose.model('Webhook', webhookSchema);

// ----------------------
// ADDITIONAL HELPER METHODS
// ----------------------

// Socket.io event handlers

// ----------------------


// CHAT ROUTES
// ----------------------

// In your chat routes
app.post('/api/chats', authenticateToken, async (req, res) => {
  try {
    const { participantId, type = 'direct', name = '', description = '' } = req.body;

    // If direct chat, check for existing chat first
    if (type === 'direct') {
      const existingChat = await ChatRoom.findOne({
        type: 'direct',
        participants: { 
          $all: [req.user.id, participantId],
          $size: 2
        }
      }).populate('participants', 'firstName lastName profilePicture');

      if (existingChat) {
        return res.json(existingChat);
      }
    }

    // Create new chat
    const chatRoom = await ChatRoom.create({
      type,
      name,
      description,
      participants: type === 'direct' ? [req.user.id, participantId] : [req.user.id],
      admin: req.user.id
    });

    // Populate participants for response
    await chatRoom.populate('participants', 'firstName lastName profilePicture');

    res.status(201).json(chatRoom);
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Error creating chat', details: error.message });
  }
});

app.get('/api/chats', authenticateToken, async (req, res) => {
  try {
    const chats = await ChatRoom.find({
      participants: req.user.id
    })
    .populate('participants', 'firstName lastName profilePicture online lastActive')
    .populate('lastMessage')
    .sort('-lastActivity')
    .exec();

    res.json(chats);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Error fetching chats' });
  }
});

// Updated endpoint for sending messages with attachments
app.post('/api/chats/:chatId/messages', authenticateToken, chatUpload.single('media'), async (req, res) => {
  try {
    const { content, messageType, replyTo } = req.body;
    
    // Validate chat exists
    const chatRoom = await ChatRoom.findById(req.params.chatId);
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    // Verify user is a participant in this chat
    if (!chatRoom.participants.some(participant => participant.toString() === req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to send messages in this chat' });
    }

    // Determine recipient (in direct chats)
    const recipient = chatRoom.type === 'direct' 
      ? chatRoom.participants.find(participant => participant.toString() !== req.user.id)
      : chatRoom.participants[0]; // Default to first participant for group chats
    
    // Determine message type based on uploaded file or specified type
    let finalMessageType = messageType || 'text';
    let mediaUrl = null;
    let fileName = null;
    let fileSize = null;
    
    if (req.file) {
      // A file was uploaded, determine message type from mimetype
      if (req.file.mimetype.startsWith('image/')) {
        finalMessageType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        finalMessageType = 'video';
      } else {
        finalMessageType = 'file';
      }
      
      mediaUrl = req.file.path; // Cloudinary URL
      fileName = req.file.originalname;
      fileSize = req.file.size;
    } else if (!content && finalMessageType !== 'poll' && finalMessageType !== 'location') {
      // No content and no file, invalid message
      return res.status(400).json({ error: 'Message must have content or attachment' });
    }
    
    // Create message object
    const messageData = {
      sender: req.user.id,
      chatRoom: req.params.chatId,
      recipient,
      content: content || '',
      messageType: finalMessageType,
      mediaUrl,
      fileName,
      fileSize
    };
    
    // Add reply reference if provided
    if (replyTo) {
      // Verify reply message exists
      const replyMessage = await Message.findById(replyTo);
      if (!replyMessage) {
        return res.status(404).json({ error: 'Reply message not found' });
      }
      
      messageData.replyTo = replyTo;
    }
    
    // Create the message
    const message = await Message.create(messageData);

    // Populate sender and recipient details
    await message.populate('sender', 'firstName lastName profilePicture');
    await message.populate('recipient', 'firstName lastName profilePicture');
    
    // If replying to a message, populate that message too
    if (replyTo) {
      await message.populate({
        path: 'replyTo',
        select: 'content sender messageType mediaUrl',
        populate: {
          path: 'sender',
          select: 'firstName lastName profilePicture'
        }
      });
    }

    // Update chat room's last message and activity
    await ChatRoom.findByIdAndUpdate(req.params.chatId, {
      lastMessage: message._id,
      lastActivity: new Date()
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message with attachment error:', error);
    
    if (error.message && error.message.includes('File size limit exceeded')) {
      return res.status(400).json({ error: 'File size exceeded the limit' });
    }
    
    res.status(500).json({ 
      error: 'Error sending message', 
      details: error.message 
    });
  }
});

app.get('/api/chats/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, before, after, lastMessageId } = req.query;
    
    let query = {
      chatRoom: req.params.chatId,
      deletedFor: { $ne: req.user.id }
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    if (after) {
      query.createdAt = { $gt: new Date(after) };
    }

    if (lastMessageId) {
      const lastMessage = await Message.findById(lastMessageId);
      if (lastMessage) {
        query.createdAt = { $gt: lastMessage.createdAt };
      }
    }

    const messages = await Message.find(query)
      .populate('sender', 'firstName lastName profilePicture')
      .populate('recipient', 'firstName lastName profilePicture')
      .populate('replyTo')
      .sort('createdAt')
      .limit(parseInt(limit));

    const hasMore = messages.length === parseInt(limit);
    const nextCursor = hasMore ? messages[messages.length - 1]._id : null;

    res.json({
      messages,
      hasMore,
      nextCursor
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Error fetching messages' });
  }
});
// Enhanced chat features - Video/Audio calls
app.post('/api/chats/:chatId/call', authenticateToken, async (req, res) => {
  try {
    const { callType } = req.body;
    
    if (!['audio', 'video'].includes(callType)) {
      return res.status(400).json({ error: 'Invalid call type' });
    }
    
    const chatRoom = await ChatRoom.findById(req.params.chatId);
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is a participant
    const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to initiate call' });
    }
    
    // Create call history entry
    const callHistory = {
      initiator: req.user.id,
      callType,
      startTime: new Date(),
      participants: [{
        user: req.user.id,
        joinedAt: new Date()
      }],
      status: 'missed' // Default status until someone joins
    };
    
    chatRoom.callHistory.push(callHistory);
    await chatRoom.save();
    
    // Create system message about call
    await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants.find(id => id.toString() !== req.user.id),
      chatRoom: chatRoom._id,
      content: `${callType === 'audio' ? 'Audio' : 'Video'} call started`,
      messageType: 'call',
      metadata: {
        callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
        callType
      }
    });
    
    // Notify other participants through WebSocket
    if (wss) {
      chatRoom.participants
        .filter(participantId => participantId.toString() !== req.user.id)
        .forEach(participantId => {
          [...wss.clients]
            .filter(client => 
              client.userId === participantId.toString() && 
              client.readyState === WebSocket.OPEN
            )
            .forEach(client => {
              client.send(JSON.stringify({
                type: 'incoming_call',
                data: {
                  chatId: chatRoom._id,
                  callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
                  callType,
                  initiator: req.user.id
                }
              }));
            });
        });
    }
    
    res.json({
      callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
      startTime: callHistory.startTime
    });
  } catch (error) {
    console.error('Initiate call error:', error);
    res.status(500).json({ error: 'Error initiating call' });
  }
});

// Chat polls
app.post('/api/chats/:chatId/polls', authenticateToken, async (req, res) => {
  try {
    const { question, options, multipleChoice, expiresIn } = req.body;
    
    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Invalid poll data' });
    }
    
    const chatRoom = await ChatRoom.findById(req.params.chatId);
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is a participant
    const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to create poll' });
    }
    
    // Create poll
    const pollOptions = options.map(option => ({
      text: option,
      votes: []
    }));
    
    // Calculate expiration time (default: 24 hours)
    const expirationHours = expiresIn ? parseInt(expiresIn) : 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);
    
    const poll = {
      creator: req.user.id,
      question,
      options: pollOptions,
      multipleChoice: multipleChoice === true,
      expiresAt,
      createdAt: new Date()
    };
    
    chatRoom.polls.push(poll);
    await chatRoom.save();
    
    // Send message about poll creation
    const message = await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants[0],
      chatRoom: chatRoom._id,
      content: `Created poll: ${question}`,
      messageType: 'poll',
      metadata: {
        pollId: chatRoom.polls[chatRoom.polls.length - 1]._id
      }
    });
    
    // Update chat room last message
    chatRoom.lastMessage = message._id;
    chatRoom.lastActivity = new Date();
    await chatRoom.save();
    
    // Notify participants through WebSocket
    if (wss) {
      chatRoom.participants.forEach(participantId => {
        [...wss.clients]
          .filter(client => 
            client.userId === participantId.toString() && 
            client.readyState === WebSocket.OPEN
          )
          .forEach(client => {
            client.send(JSON.stringify({
              type: 'new_poll',
              data: {
                chatId: chatRoom._id,
                poll: chatRoom.polls[chatRoom.polls.length - 1],
                message: message
              }
            }));
          });
      });
    }
    
    res.status(201).json(chatRoom.polls[chatRoom.polls.length - 1]);
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ error: 'Error creating poll' });
  }
});
// DELETE a message
app.delete('/api/chats/:chatId/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    
    // Check if message exists
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user is the sender or has permission to delete
    if (message.sender.toString() !== req.user.id) {
      // Check if user is chat admin if it's a group chat
      const chatRoom = await ChatRoom.findById(chatId);
      if (!chatRoom || (chatRoom.type === 'group' && chatRoom.admin.toString() !== req.user.id)) {
        return res.status(403).json({ error: 'Not authorized to delete this message' });
      }
    }
    
    // Soft delete by marking message as deleted for the user
    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { deletedFor: req.user.id }
    });
    
    res.json({ success: true, messageId });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Error deleting message' });
  }
});

// Add reaction to a message
app.post('/api/chats/:chatId/messages/:messageId/react', authenticateToken, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { reaction } = req.body;
    
    if (!reaction) {
      return res.status(400).json({ error: 'Reaction is required' });
    }
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user has already reacted with this reaction
    const existingReactionIndex = message.reactions.findIndex(
      r => r.user.toString() === req.user.id && r.reaction === reaction
    );
    
    if (existingReactionIndex !== -1) {
      // Remove existing reaction (toggle behavior)
      message.reactions.splice(existingReactionIndex, 1);
    } else {
      // Remove any existing reaction by this user
      message.reactions = message.reactions.filter(
        r => r.user.toString() !== req.user.id
      );
      
      // Add the new reaction
      message.reactions.push({
        user: req.user.id,
        reaction
      });
    }
    
    await message.save();
    
    res.json({
      success: true,
      messageId,
      userId: req.user.id,
      reactions: message.reactions
    });
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ error: 'Error adding reaction to message' });
  }
});

// Remove reaction from a message
app.delete('/api/chats/:chatId/messages/:messageId/react', authenticateToken, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Remove any reaction by this user
    message.reactions = message.reactions.filter(
      r => r.user.toString() !== req.user.id
    );
    
    await message.save();
    
    res.json({
      success: true,
      messageId,
      userId: req.user.id
    });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Error removing reaction' });
  }
});

// Separate endpoints for audio and video calls
app.post('/api/calls/:chatId/audio', authenticateToken, async (req, res) => {
  try {
    const chatRoom = await ChatRoom.findById(req.params.chatId);
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is a participant
    const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to initiate call' });
    }
    
    // Create call history entry
    const callHistory = {
      initiator: req.user.id,
      callType: 'audio',
      startTime: new Date(),
      participants: [{
        user: req.user.id,
        joinedAt: new Date()
      }],
      status: 'missed' // Default status until someone joins
    };
    
    chatRoom.callHistory.push(callHistory);
    await chatRoom.save();
    
    // Create system message about call
    await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants.find(id => id.toString() !== req.user.id),
      chatRoom: chatRoom._id,
      content: 'Audio call started',
      messageType: 'call',
      metadata: {
        callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
        callType: 'audio'
      }
    });
    
    res.json({
      callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
      startTime: callHistory.startTime,
      initiator: req.user.id
    });
  } catch (error) {
    console.error('Start audio call error:', error);
    res.status(500).json({ error: 'Error starting audio call' });
  }
});

app.post('/api/calls/:chatId/video', authenticateToken, async (req, res) => {
  try {
    const chatRoom = await ChatRoom.findById(req.params.chatId);
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is a participant
    const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to initiate call' });
    }
    
    // Create call history entry
    const callHistory = {
      initiator: req.user.id,
      callType: 'video',
      startTime: new Date(),
      participants: [{
        user: req.user.id,
        joinedAt: new Date()
      }],
      status: 'missed' // Default status until someone joins
    };
    
    chatRoom.callHistory.push(callHistory);
    await chatRoom.save();
    
    // Create system message about call
    await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants.find(id => id.toString() !== req.user.id),
      chatRoom: chatRoom._id,
      content: 'Video call started',
      messageType: 'call',
      metadata: {
        callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
        callType: 'video'
      }
    });
    
    res.json({
      callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
      startTime: callHistory.startTime,
      initiator: req.user.id
    });
  } catch (error) {
    console.error('Start video call error:', error);
    res.status(500).json({ error: 'Error starting video call' });
  }
});

// Call management endpoints
app.post('/api/calls/:callId/accept', authenticateToken, async (req, res) => {
  try {
    // Find chat room containing this call
    const chatRoom = await ChatRoom.findOne({
      'callHistory._id': req.params.callId
    });
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Find the specific call in the history
    const callIndex = chatRoom.callHistory.findIndex(
      call => call._id.toString() === req.params.callId
    );
    
    if (callIndex === -1) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Check if user is a participant in the chat
    const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to accept this call' });
    }
    
    // Check if user is already in the call
    const isInCall = chatRoom.callHistory[callIndex].participants.some(
      participant => participant.user.toString() === req.user.id
    );
    
    if (!isInCall) {
      // Add user to call participants
      chatRoom.callHistory[callIndex].participants.push({
        user: req.user.id,
        joinedAt: new Date()
      });
      
      // Update call status
      chatRoom.callHistory[callIndex].status = 'completed';
    }
    
    await chatRoom.save();
    
    res.json({
      success: true,
      callId: req.params.callId,
      acceptedBy: req.user.id
    });
  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ error: 'Error accepting call' });
  }
});

app.post('/api/calls/:callId/decline', authenticateToken, async (req, res) => {
  try {
    // Find chat room containing this call
    const chatRoom = await ChatRoom.findOne({
      'callHistory._id': req.params.callId
    });
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Find the specific call in the history
    const callIndex = chatRoom.callHistory.findIndex(
      call => call._id.toString() === req.params.callId
    );
    
    if (callIndex === -1) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Check if user is a participant in the chat
    const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to decline this call' });
    }
    
    // Update call status
    chatRoom.callHistory[callIndex].status = 'declined';
    
    await chatRoom.save();
    
    // Create system message about call decline
    await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants.find(id => id.toString() !== req.user.id),
      chatRoom: chatRoom._id,
      content: 'Call declined',
      messageType: 'call',
      metadata: {
        callId: req.params.callId,
        callType: chatRoom.callHistory[callIndex].callType,
        status: 'declined'
      }
    });
    
    res.json({
      success: true,
      callId: req.params.callId,
      declinedBy: req.user.id
    });
  } catch (error) {
    console.error('Decline call error:', error);
    res.status(500).json({ error: 'Error declining call' });
  }
});

app.post('/api/calls/:callId/end', authenticateToken, async (req, res) => {
  try {
    // Find chat room containing this call
    const chatRoom = await ChatRoom.findOne({
      'callHistory._id': req.params.callId
    });
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Find the specific call in the history
    const callIndex = chatRoom.callHistory.findIndex(
      call => call._id.toString() === req.params.callId
    );
    
    if (callIndex === -1) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Check if user is a participant in the call
    const isInCall = chatRoom.callHistory[callIndex].participants.some(
      participant => participant.user.toString() === req.user.id
    );
    
    if (!isInCall) {
      return res.status(403).json({ error: 'Not authorized to end this call' });
    }
    
    // Set end time and calculate duration
    const endTime = new Date();
    const startTime = chatRoom.callHistory[callIndex].startTime;
    const durationMs = endTime - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);
    
    // Update call record
    chatRoom.callHistory[callIndex].endTime = endTime;
    chatRoom.callHistory[callIndex].duration = durationSeconds;
    
    // Update user's left time
    const participantIndex = chatRoom.callHistory[callIndex].participants.findIndex(
      participant => participant.user.toString() === req.user.id
    );
    
    if (participantIndex !== -1) {
      chatRoom.callHistory[callIndex].participants[participantIndex].leftAt = endTime;
    }
    
    // If all participants have left, mark call as ended
    const allLeft = chatRoom.callHistory[callIndex].participants.every(
      participant => participant.leftAt
    );
    
    if (allLeft) {
      chatRoom.callHistory[callIndex].status = 'completed';
    }
    
    await chatRoom.save();
    
    // Create system message about call ending
    await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants.find(id => id.toString() !== req.user.id),
      chatRoom: chatRoom._id,
      content: `Call ended (${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')})`,
      messageType: 'call',
      metadata: {
        callId: req.params.callId,
        callType: chatRoom.callHistory[callIndex].callType,
        status: 'ended',
        duration: durationSeconds
      }
    });
    
    res.json({
      success: true,
      callId: req.params.callId,
      endedBy: req.user.id,
      duration: durationSeconds
    });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ error: 'Error ending call' });
  }
});
// ----------------------
// STORY ROUTES
// ----------------------

app.post('/api/stories', authenticateToken, storyUpload.single('media'), async (req, res) => {
  try {
    console.log('Starting story creation...');
    console.log('User: ', req.user ? req.user.id : 'No user');
    console.log('File: ', req.file ? 'File uploaded' : 'No file');
    console.log('Content: ', req.body.content || 'No content');
    
    if (!req.file) {
      return res.status(400).json({ error: 'Media file is required' });
    }
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Create minimal story first to test
    const story = await Story.create({
      author: req.user.id,
      content: req.body.content || 'Default caption',
      mediaUrl: req.file.path,
      mediaType: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
      filter: req.body.filter || 'none',
      textPosition: req.body.textPosition || 'bottom',
    });
    
    console.log('Story created successfully with ID:', story._id);
    res.status(201).json(story);
  } catch (error) {
    console.error('Story creation error:', error);
    res.status(500).json({ error: 'Error creating story', message: error.message });
  }
});


app.get('/api/stories', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const connections = user.connections || [];
    const following = user.following || [];
    
    // Get stories from connections, following, and self
    const visibleUsers = [...new Set([...connections, ...following, req.user.id])];

    const stories = await Story.find({
      author: { $in: visibleUsers },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
    .populate('author', 'firstName lastName profilePicture')
    .populate('mentions.user', 'firstName lastName profilePicture')
    .populate('reactions.user', 'firstName lastName profilePicture')
    .populate('replies.user', 'firstName lastName profilePicture')
    .sort('-createdAt');

    // Group stories by author
    const storiesByAuthor = {};
    stories.forEach(story => {
      const authorId = story.author._id.toString();
      if (!storiesByAuthor[authorId]) {
        storiesByAuthor[authorId] = {
          author: story.author,
          stories: []
        };
      }
      
      // Check if this user has viewed the story
      const hasViewed = story.viewers.some(viewer => 
        viewer.user.toString() === req.user.id
      );
      
      // Check if this user has reacted to the story
      const userReaction = story.reactions.find(reaction => 
        reaction.user._id.toString() === req.user.id
      );
      
      storiesByAuthor[authorId].stories.push({
        ...story.toObject(),
        viewed: hasViewed,
        userReaction: userReaction ? userReaction.reaction : null
      });
    });

    // Convert to array
    const result = Object.values(storiesByAuthor);
    
    res.json(result);
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ error: 'Error fetching stories' });
  }
});

app.post('/api/stories/:storyId/react', authenticateToken, async (req, res) => {
  try {
    const { reaction } = req.body;
    
    if (!reaction || !['heart', 'laugh', 'wow', 'sad', 'angry', 'fire', 'clap', 'question'].includes(reaction)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }
    
    const story = await Story.findById(req.params.storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }
    
    // Check if user already reacted
    const existingReaction = story.reactions.find(
      r => r.user.toString() === req.user.id && r.reaction === reaction
    );
    
    if (existingReaction) {
      // Remove reaction if same type already exists (toggle behavior)
      story.reactions = story.reactions.filter(
        r => !(r.user.toString() === req.user.id && r.reaction === reaction)
      );
    } else {
      // Remove any existing reactions of different types from this user
      story.reactions = story.reactions.filter(
        r => r.user.toString() !== req.user.id
      );
      
      // Add new reaction
      story.reactions.push({
        user: req.user.id,
        reaction,
        createdAt: new Date()
      });
      
      // Notify story author if it's not their own reaction
      if (story.author.toString() !== req.user.id) {
        const user = await User.findById(req.user.id);
        
        await createNotification({
          recipient: story.author,
          sender: req.user.id,
          type: 'reaction',
          contentType: 'story',
          contentId: story._id,
          text: `${user.firstName} ${user.lastName} reacted to your story with ${reaction}`,
          actionUrl: `/stories/view/${story._id}`
        });
      }
    }
    
    await story.save();
    
    res.json({
      success: true,
      reactionCount: story.reactions.length,
      hasReacted: !existingReaction // true if added, false if removed
    });
  } catch (error) {
    console.error('Story reaction error:', error);
    res.status(500).json({ error: 'Error reacting to story' });
  }
});

app.post('/api/stories/:storyId/view', authenticateToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (!story.viewers.some(viewer => viewer.user.equals(req.user.id))) {
      story.viewers.push({ user: req.user.id });
      await story.save();
    }

    res.json({ message: 'Story viewed' });
  } catch (error) {
    console.error('View story error:', error);
    res.status(500).json({ error: 'Error marking story as viewed' });
  }
});
app.post('/api/stories/:storyId/reply', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'Reply message is required' });
    }
    
    const story = await Story.findById(req.params.storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }
    
    // Add reply
    story.replies.push({
      user: req.user.id,
      message: message.trim(),
      createdAt: new Date()
    });
    
    await story.save();
    
    // Populate user details for the new reply
    const populatedStory = await Story.findById(story._id)
      .populate('replies.user', 'firstName lastName profilePicture');
    
    const newReply = populatedStory.replies[populatedStory.replies.length - 1];
    
    // Notify story author if it's not their own reply
    if (story.author.toString() !== req.user.id) {
      const user = await User.findById(req.user.id);
      
      await createNotification({
        recipient: story.author,
        sender: req.user.id,
        type: 'comment',
        contentType: 'story',
        contentId: story._id,
        text: `${user.firstName} ${user.lastName} replied to your story: "${message.length > 30 ? message.slice(0, 30) + '...' : message}"`,
        actionUrl: `/stories/view/${story._id}`
      });
    }
    
    res.json(newReply);
  } catch (error) {
    console.error('Story reply error:', error);
    res.status(500).json({ error: 'Error replying to story' });
  }
});

// Highlight routes
app.post('/api/highlights', authenticateToken, async (req, res) => {
  try {
    const { title, stories } = req.body;
    
    const highlight = await Highlight.create({
      author: req.user.id,
      title,
      stories
    });

    res.status(201).json(highlight);
  } catch (error) {
    console.error('Create highlight error:', error);
    res.status(500).json({ error: 'Error creating highlight' });
  }
});

app.get('/api/highlights/:userId', authenticateToken, async (req, res) => {
  try {
    const highlights = await Highlight.find({ author: req.params.userId })
      .populate('author', 'firstName lastName profilePicture')
      .sort('-createdAt');

    res.json(highlights);
  } catch (error) {
    console.error('Get highlights error:', error);
    res.status(500).json({ error: 'Error fetching highlights' });
  }
});
app.post('/api/posts', authenticateToken, postUpload.array('media', 10), async (req, res) => {
  try {
    const {
      content,
      type,
      visibility,
      location,
      mentions,
      tags,
      pollData,
      articleData,
      linkUrl,
      captions
    } = req.body;
    
    // Validate content requirement
    if (!content && !req.files?.length && !linkUrl && !pollData && !articleData) {
      return res.status(400).json({ error: 'Post must have content, media, link, poll, or article data' });
    }
    
    // Determine post type based on provided data
    let postType = type || 'text';
    if (!type) {
      if (req.files?.length > 0) {
        postType = req.files[0].mimetype.startsWith('image/') ? 'image' : 'video';
      } else if (linkUrl) {
        postType = 'link';
      } else if (pollData) {
        postType = 'poll';
      } else if (articleData) {
        postType = 'article';
      }
    }
    
    // Process location data
    let locationData = null;
    if (location) {
      try {
        locationData = typeof location === 'string' ? JSON.parse(location) : location;
      } catch (error) {
        console.error('Error parsing location data:', error);
      }
    }
    
    // Process mentions data
    let mentionsData = [];
    if (mentions) {
      try {
        mentionsData = typeof mentions === 'string' ? JSON.parse(mentions) : mentions;
      } catch (error) {
        console.error('Error parsing mentions data:', error);
      }
    }
    
    // Process tags/hashtags
    let parsedTags = [];
    if (tags) {
      parsedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
    }
    
    // Extract hashtags from content
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const hashtagMatches = content ? [...content.matchAll(hashtagRegex)] : [];
    const contentHashtags = hashtagMatches.map(match => match[1].toLowerCase());
    
    // Combine explicit tags and content hashtags
    const allTags = [...new Set([...parsedTags, ...contentHashtags])];
    
    // Process media files and captions
    let images = [];
    let videos = [];
    
    if (req.files && req.files.length > 0) {
      let parsedCaptions = {};
      
      if (captions) {
        try {
          parsedCaptions = typeof captions === 'string' ? JSON.parse(captions) : captions;
        } catch (error) {
          console.error('Error parsing captions:', error);
        }
      }
      
      req.files.forEach((file, index) => {
        if (file.mimetype.startsWith('image/')) {
          images.push({
            url: file.path,
            caption: parsedCaptions[index] || '',
            altText: parsedCaptions[index] || '',
            order: index
          });
        } else if (file.mimetype.startsWith('video/')) {
          videos.push({
            url: file.path,
            thumbnail: '', // Cloudinary can generate this automatically
            caption: parsedCaptions[index] || '',
            duration: 0 // To be determined later
          });
        }
      });
    }
    
    // Process link preview if URL provided
    let linkPreviewData = null;
    if (linkUrl) {
      // In a real app, you would use a service like OpenGraph to fetch metadata
      // For now, we'll just store the URL
      linkPreviewData = {
        url: linkUrl,
        title: '',
        description: '',
        imageUrl: ''
      };
      
      // You could add URL metadata extraction here using a library like 'open-graph-scraper'
    }
    
    // Process poll data
    let processedPollData = null;
    if (pollData) {
      try {
        const parsed = typeof pollData === 'string' ? JSON.parse(pollData) : pollData;
        
        if (!parsed.question || !parsed.options || !Array.isArray(parsed.options) || parsed.options.length < 2) {
          return res.status(400).json({ error: 'Poll must have a question and at least 2 options' });
        }
        
        processedPollData = {
          question: parsed.question,
          options: parsed.options.map(option => ({
            text: option,
            votes: []
          })),
          expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 1 week
          allowMultipleVotes: parsed.allowMultipleVotes || false
        };
      } catch (error) {
        console.error('Error parsing poll data:', error);
        return res.status(400).json({ error: 'Invalid poll data format' });
      }
    }
    
    // Process article data
    let processedArticleData = null;
    if (articleData) {
      try {
        processedArticleData = typeof articleData === 'string' ? JSON.parse(articleData) : articleData;
      } catch (error) {
        console.error('Error parsing article data:', error);
      }
    }
    
    // Create the post
    const post = await Post.create({
      author: req.user.id,
      content: content || '',
      type: postType,
      images,
      videos,
      visibility: visibility || 'public',
      location: locationData,
      mentions: mentionsData,
      hashtags: contentHashtags,
      linkPreview: linkPreviewData,
      pollData: processedPollData,
      articleData: processedArticleData,
      tags: allTags
    });
    
    // Process hashtags to update global hashtag counts
    if (allTags.length > 0) {
      await updateHashtags(allTags, 'post');
    }
    
    // Process mentions to create notifications and mention records
    if (mentionsData.length > 0) {
      const user = await User.findById(req.user.id)
        .select('firstName lastName');
      
      for (const mention of mentionsData) {
        // Create notification
        await createNotification({
          recipient: mention.user,
          sender: req.user.id,
          type: 'mention',
          contentType: 'post',
          contentId: post._id,
          text: `${user.firstName} ${user.lastName} mentioned you in a post`,
          actionUrl: `/posts/${post._id}`
        });
        
        // Create mention record
        await Mention.create({
          user: mention.user,
          mentionedBy: req.user.id,
          contentType: 'post',
          contentId: post._id
        });
      }
    }
    
    // Populate the post for response
    const populatedPost = await Post.findById(post._id)
      .populate('author', 'firstName lastName profilePicture headline')
      .populate('mentions.user', 'firstName lastName profilePicture')
      .populate('likes.user', 'firstName lastName profilePicture');
    
    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Create post error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeded. Maximum file size is 100MB.' });
    }
    
    if (error.message && error.message.includes('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Error creating post' });
  }
});
app.post('/api/posts/:postId/react', authenticateToken, async (req, res) => {
  try {
    const { reaction } = req.body;
    
    if (!reaction || !['like', 'love', 'celebrate', 'support', 'insightful', 'curious'].includes(reaction)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }
    
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Check if user already reacted
    const existingLike = post.likes.find(like => like.user.toString() === req.user.id);
    
    if (existingLike) {
      if (existingLike.reaction === reaction) {
        // Remove reaction if same type (toggle)
        post.likes = post.likes.filter(like => like.user.toString() !== req.user.id);
      } else {
        // Update reaction type
        existingLike.reaction = reaction;
        existingLike.createdAt = new Date();
      }
    } else {
      // Add new reaction
      post.likes.push({
        user: req.user.id,
        reaction,
        createdAt: new Date()
      });
      
      // Notify post author if it's not their own post
      if (post.author.toString() !== req.user.id) {
        const user = await User.findById(req.user.id)
          .select('firstName lastName');
        
        await createNotification({
          recipient: post.author,
          sender: req.user.id,
          type: 'like',
          contentType: 'post',
          contentId: post._id,
          text: `${user.firstName} ${user.lastName} reacted to your post with ${reaction}`,
          actionUrl: `/posts/${post._id}`
        });
        
        // Update analytics
        await User.findByIdAndUpdate(post.author, {
          $inc: { 'analytics.contentEngagement.likes': 1 }
        });
      }
    }
    
    await post.save();
    
    // Count reactions by type
    const reactionCounts = {};
    post.likes.forEach(like => {
      if (!reactionCounts[like.reaction]) {
        reactionCounts[like.reaction] = 0;
      }
      reactionCounts[like.reaction]++;
    });
    
    // Get user's current reaction
    const userReaction = post.likes.find(like => like.user.toString() === req.user.id)?.reaction || null;
    
    res.json({
      success: true,
      reactionCounts,
      totalLikes: post.likes.length,
      userReaction
    });
  } catch (error) {
    console.error('Post reaction error:', error);
    res.status(500).json({ error: 'Error updating post reaction' });
  }
});
// Add this to your server.js file

// Get posts (paginated)
app.get('/api/posts', authenticateToken, async (req, res) => {
  try {
    const { limit = 10, before, after } = req.query;
    
    // Build query
    let query = {};
    
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    if (after) {
      query.createdAt = { $gt: new Date(after) };
    }
    
    // Apply privacy filter
    const user = await User.findById(req.user.id);
    query.$or = [
      { visibility: 'public' },
      { visibility: 'connections', author: { $in: user.connections || [] } },
      { author: req.user.id }
    ];
    
    // Execute query with sorting and pagination
    const posts = await Post.find(query)
      .populate('author', 'firstName lastName profilePicture headline')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({
      posts,
      hasMore: posts.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Error fetching posts' });
  }
});
// ----------------------
// DISCOVERY SYSTEM ROUTES
// ----------------------

// Event Routes
app.post('/api/events', authenticateToken, upload.single('coverImage'), async (req, res) => {
  try {
    const {
      title, description, eventType, category, tags,
      startDate, endDate, location, privacy
    } = req.body;

    // Parse location 
    let locationData = {};
    if (typeof location === 'string') {
      try {
        locationData = JSON.parse(location);
      } catch (e) {
        locationData = { address: location };
      }
    } else if (typeof location === 'object') {
      locationData = location;
    }

    const event = await Event.create({
      creator: req.user.id,
      title,
      description,
      eventType,
      category,
      tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      location: locationData,
      coverImage: req.file ? req.file.path : req.body.coverImage,
      privacy,
      attendees: [{ user: req.user.id, status: 'going' }]
    });

    // Update hashtags if provided
    if (tags) {
      const tagsArray = typeof tags === 'string' ? tags.split(',') : tags;
      await updateHashtags(tagsArray, 'event');
    }

    const populatedEvent = await Event.findById(event._id)
      .populate('creator', 'firstName lastName profilePicture')
      .populate('attendees.user', 'firstName lastName profilePicture');

    res.status(201).json(populatedEvent);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Error creating event' });
  }
});

app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const {
      category, startDate, endDate, location, distance,
      lat, lng, tags, page = 1, limit = 10
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    let query = {};

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.endDate.$lte = new Date(endDate);
    } else {
      // By default, only show upcoming events
      query.startDate = { $gte: new Date() };
    }

    // Filter by location proximity
    if (lat && lng && distance) {
      query['location.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(distance) * 1000 // Convert km to meters
        }
      };
    } else if (location) {
      query['location.city'] = location;
    }

    // Filter by tags
    if (tags) {
      const tagArray = tags.split(',');
      query.tags = { $in: tagArray };
    }

    // Privacy filter (only show public events or events where user is invited)
    query.$or = [
      { privacy: 'public' },
      { privacy: 'invite-only', 'attendees.user': req.user.id },
      { creator: req.user.id }
    ];

    const events = await Event.find(query)
      .populate('creator', 'firstName lastName profilePicture')
      .populate('attendees.user', 'firstName lastName profilePicture')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalEvents = await Event.countDocuments(query);

    res.json({
      events,
      pagination: {
        total: totalEvents,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalEvents / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Error fetching events' });
  }
});

// Podcast Routes
app.post('/api/podcasts', authenticateToken, upload.single('coverImage'), async (req, res) => {
  try {
    const {
      title, description, category, tags
    } = req.body;
    
    const podcast = await Podcast.create({
      creator: req.user.id,
      title,
      description,
      coverImage: req.file ? req.file.path : req.body.coverImage,
      category,
      tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
      episodes: []
    });
    
    // Update hashtags if provided
    if (tags) {
      const tagsArray = typeof tags === 'string' ? tags.split(',') : tags;
      await updateHashtags(tagsArray, 'podcast');
    }
    
    const populatedPodcast = await Podcast.findById(podcast._id)
      .populate('creator', 'firstName lastName profilePicture');
    
    res.status(201).json(populatedPodcast);
  } catch (error) {
    console.error('Create podcast error:', error);
    res.status(500).json({ error: 'Error creating podcast' });
  }
});

// Job Routes
app.post('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const {
      title, description, jobType, location, salary,
      requirements, responsibilities, skills, experienceLevel,
      industry, applicationDeadline, applicationLink, company
    } = req.body;
    
    // Validate company information
    let companyId = null;
    if (company && company.companyId) {
      const companyDoc = await Company.findById(company.companyId);
      if (!companyDoc) {
        return res.status(404).json({ error: 'Company not found' });
      }
      
      // Check if user has permission to post for this company
      const isAdmin = companyDoc.admins.some(admin => 
        admin.toString() === req.user.id
      );
      
      if (!isAdmin) {
        return res.status(403).json({ error: 'Not authorized to post jobs for this company' });
      }
      
      companyId = company.companyId;
    }
    
    const job = await Job.create({
      creator: req.user.id,
      title,
      description,
      jobType,
      location,
      salary,
      requirements: requirements ? (typeof requirements === 'string' ? requirements.split(',') : requirements) : [],
      responsibilities: responsibilities ? (typeof responsibilities === 'string' ? responsibilities.split(',') : responsibilities) : [],
      skills: skills ? (typeof skills === 'string' ? skills.split(',') : skills) : [],
      experienceLevel,
      industry,
      applicationDeadline: applicationDeadline ? new Date(applicationDeadline) : null,
      applicationLink,
      company: {
        companyId,
        name: company ? company.name : undefined,
        logo: company ? company.logo : undefined,
        website: company ? company.website : undefined
      }
    });
    
    // Update hashtags for skills
    if (skills) {
      const skillsArray = typeof skills === 'string' ? skills.split(',') : skills;
      await updateHashtags(skillsArray, 'job');
    }
    
    res.status(201).json(job);
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Error creating job' });
  }
});

// Discovery Dashboard API
app.get('/api/discover', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's skills, industry, location
    const userSkills = user.skills ? user.skills.map(s => s.name) : [];
    const userIndustry = user.industry;
    const userLocation = user.location;
    
    // Get personalized content
    // 1. Recommended Events
    const recommendedEvents = await Event.find({
      privacy: 'public',
      startDate: { $gte: new Date() },
      $or: [
        { category: userIndustry },
        { tags: { $in: userSkills } }
      ]
    })
    .populate('creator', 'firstName lastName profilePicture')
    .sort({ startDate: 1 })
    .limit(5);
    
    // 2. Trending Podcasts
    const trendingPodcasts = await Podcast.find({})
      .sort({ 'subscribers.length': -1, createdAt: -1 })
      .populate('creator', 'firstName lastName profilePicture')
      .limit(5);
    
    // 3. Relevant Jobs
    let jobQuery = { active: true };
    if (userSkills.length > 0) {
      jobQuery.skills = { $in: userSkills };
    }
    if (userIndustry) {
      jobQuery.industry = userIndustry;
    }
    
    const relevantJobs = await Job.find(jobQuery)
      .populate('creator', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // 4. Featured Projects
    const featuredProjects = await Project.find({
      featured: true,
      visibility: 'public'
    })
    .populate('user', 'firstName lastName profilePicture')
    .sort({ updatedAt: -1 })
    .limit(5);
    
    // 5. Content from connections
    const connectionIds = user.connections || [];
    const connectionContent = {
      events: await Event.find({
        creator: { $in: connectionIds },
        privacy: 'public',
        startDate: { $gte: new Date() }
      })
      .populate('creator', 'firstName lastName profilePicture')
      .sort({ startDate: 1 })
      .limit(3),
      
      podcasts: await Podcast.find({
        creator: { $in: connectionIds }
      })
      .populate('creator', 'firstName lastName profilePicture')
      .sort({ updatedAt: -1 })
      .limit(3),
      
      projects: await Project.find({
        user: { $in: connectionIds },
        visibility: { $in: ['public', 'connections'] }
      })
      .populate('user', 'firstName lastName profilePicture')
      .sort({ updatedAt: -1 })
      .limit(3)
    };
    
    // 6. Trending hashtags
    const trendingHashtags = await Hashtag.find({ trending: true })
      .sort({ 
        eventCount: -1, 
        podcastCount: -1, 
        jobCount: -1 
      })
      .limit(10);
    
    res.json({
      recommendedEvents,
      trendingPodcasts,
      relevantJobs,
      featuredProjects,
      connectionContent,
      trendingHashtags
    });
  } catch (error) {
    console.error('Discover dashboard error:', error);
    res.status(500).json({ error: 'Error loading discover content' });
  }
});
// 1. Record a profile view
app.post('/api/profile-views', authenticateToken, async (req, res) => {
  try {
    const { profileId } = req.body;
    
    // Add validation for profileId
    if (!profileId) {
      return res.status(400).json({ error: 'Profile ID is required' });
    }
    
    // Check if profileId is a valid ObjectId
    if (!mongoose.isValidObjectId(profileId)) {
      return res.status(400).json({ error: 'Invalid profile ID format' });
    }
    
    // Don't record views of your own profile
    if (profileId === req.user.id) {
      return res.status(400).json({ error: 'Cannot record views of your own profile' });
    }
    
    // Get both users to check privacy settings
    const [viewedUser, viewingUser] = await Promise.all([
      User.findById(profileId),
      User.findById(req.user.id)
    ]);
    
    // Rest of the function remains the same...
  } catch (error) {
    console.error('Record profile view error:', error);
    res.status(500).json({ error: 'Error recording profile view' });
  }
});
// 2. Get users who viewed your profile
app.get('/api/profile-views/viewers', authenticateToken, async (req, res) => {
  try {
    const { 
      limit = 10, 
      page = 1, 
      period = 'month' // day, week, month, year, all
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Determine date range based on period
    let dateFilter = {};
    const now = new Date();
    
    if (period !== 'all') {
      const startDate = new Date();
      
      switch(period) {
        case 'day':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }
      
      dateFilter = { viewedAt: { $gte: startDate, $lte: now } };
    }
    
    // Get count of viewers grouped by viewerId and visibility
    const viewerData = await ProfileView.aggregate([
      { 
        $match: { 
          profileId: new mongoose.Types.ObjectId(req.user.id),
          ...dateFilter
        } 
      },
      {
        $sort: { viewedAt: -1 }
      },
      {
        $group: {
          _id: "$viewerId",
          visibility: { $first: "$visibility" },
          lastViewed: { $max: "$viewedAt" },
          viewCount: { $sum: 1 }
        }
      },
      {
        $sort: { lastViewed: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      }
    ]);
    
    // Get total count
    const totalViewers = await ProfileView.aggregate([
      { 
        $match: { 
          profileId: new mongoose.Types.ObjectId(req.user.id),
          ...dateFilter
        } 
      },
      {
        $group: {
          _id: "$viewerId"
        }
      },
      {
        $count: "total"
      }
    ]);
    
    const total = totalViewers.length > 0 ? totalViewers[0].total : 0;
    
    // Populate viewer information based on visibility level
    const populatedViewers = await Promise.all(
      viewerData.map(async (viewer) => {
        if (viewer.visibility === 'anonymous') {
          // For anonymous viewers, return generic info
          return {
            _id: null,
            anonymous: true,
            lastViewed: viewer.lastViewed,
            viewCount: viewer.viewCount,
            title: 'Someone',
            description: 'This person is viewing profiles anonymously'
          };
        } else {
          // For identifiable viewers, get user details
          const viewerUser = await User.findById(viewer._id)
            .select('firstName lastName profilePicture headline industry company location')
            .lean();
          
          if (!viewerUser) {
            return {
              _id: null,
              deleted: true,
              lastViewed: viewer.lastViewed,
              viewCount: viewer.viewCount,
              title: 'Deleted User',
              description: 'This user no longer exists'
            };
          }
          
          // For limited visibility, mask details
          if (viewer.visibility === 'limited') {
            return {
              _id: null,
              limited: true,
              lastViewed: viewer.lastViewed,
              viewCount: viewer.viewCount,
              title: viewerUser.industry || 'Professional',
              description: `${viewerUser.company?.name || 'A company'} • ${viewerUser.location?.address || 'Unknown location'}`
            };
          }
          
          // Full visibility
          return {
            ...viewerUser,
            lastViewed: viewer.lastViewed,
            viewCount: viewer.viewCount
          };
        }
      })
    );
    
    res.json({
      viewers: populatedViewers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get profile viewers error:', error);
    res.status(500).json({ error: 'Error fetching profile viewers' });
  }
});

// 3. Get profile view analytics 
app.get('/api/profile-views/analytics', authenticateToken, async (req, res) => {
  try {
    const { period = 'month' } = req.query; // day, week, month, year
    
    // Get the user's analytics data
    const user = await User.findById(req.user.id)
      .select('analytics.profileViews')
      .lean();
    
    if (!user || !user.analytics || !user.analytics.profileViews) {
      return res.json({
        totalViews: 0,
        viewsHistory: [],
        percentChange: 0
      });
    }
    
    // Determine date ranges for current and previous periods
    const now = new Date();
    let startDate, prevStartDate, prevEndDate;
    
    switch(period) {
      case 'day':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        
        prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - 1);
        prevEndDate = new Date(startDate);
        break;
      
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        
        prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - 7);
        prevEndDate = new Date(startDate);
        break;
      
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        
        prevStartDate = new Date(startDate);
        prevStartDate.setMonth(prevStartDate.getMonth() - 1);
        prevEndDate = new Date(startDate);
        break;
      
      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        
        prevStartDate = new Date(startDate);
        prevStartDate.setFullYear(prevStartDate.getFullYear() - 1);
        prevEndDate = new Date(startDate);
        break;
    }
    
    // Filter view history for current period
    const viewsHistory = user.analytics.profileViews.history
      .filter(entry => new Date(entry.date) >= startDate && new Date(entry.date) <= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate total views for current period
    const totalViews = viewsHistory.reduce((sum, entry) => sum + entry.count, 0);
    
    // Calculate total views for previous period for comparison
    const prevViewsHistory = user.analytics.profileViews.history
      .filter(entry => new Date(entry.date) >= prevStartDate && new Date(entry.date) < prevEndDate);
    
    const prevTotalViews = prevViewsHistory.reduce((sum, entry) => sum + entry.count, 0);
    
    // Calculate percent change
    let percentChange = 0;
    if (prevTotalViews > 0) {
      percentChange = Math.round(((totalViews - prevTotalViews) / prevTotalViews) * 100);
    } else if (totalViews > 0) {
      percentChange = 100; // If previous period had 0 views and current has some
    }
    
    // Get top industries of viewers
    // This requires a more complex query to the ProfileView collection
    const topIndustries = await ProfileView.aggregate([
      {
        $match: {
          profileId: new mongoose.Types.ObjectId(req.user.id),
          viewedAt: { $gte: startDate, $lte: now },
          visibility: { $ne: 'anonymous' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'viewerId',
          foreignField: '_id',
          as: 'viewer'
        }
      },
      { $unwind: '$viewer' },
      {
        $group: {
          _id: '$viewer.industry',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    res.json({
      totalViews,
      viewsHistory,
      percentChange,
      previousPeriodViews: prevTotalViews,
      topIndustries: topIndustries.map(item => ({
        industry: item._id || 'Unknown',
        count: item.count
      }))
    });
  } catch (error) {
    console.error('Get profile view analytics error:', error);
    res.status(500).json({ error: 'Error fetching profile view analytics' });
  }
});

// 4. Update profile view privacy settings
app.put('/api/settings/profile-view-privacy', authenticateToken, async (req, res) => {
  try {
    const { visibility } = req.body;
    
    if (!['full', 'limited', 'anonymous'].includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility option' });
    }
    
    // Update user's privacy settings
    await User.findByIdAndUpdate(req.user.id, {
      'privacy.profileViewSettings': visibility
    });
    
    res.json({
      success: true,
      message: 'Profile view privacy settings updated',
      visibility
    });
  } catch (error) {
    console.error('Update profile view privacy settings error:', error);
    res.status(500).json({ error: 'Error updating profile view privacy settings' });
  }
});

// 5. Get your recent profile view activity (who you viewed)
app.get('/api/profile-views/activity', authenticateToken, async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get profiles you viewed
    const viewedProfiles = await ProfileView.find({
      viewerId: req.user.id
    })
    .sort('-viewedAt')
    .skip(skip)
    .limit(parseInt(limit));
    
    // Get total count
    const total = await ProfileView.countDocuments({ viewerId: req.user.id });
    
    // Populate profile information
    const populatedViews = await Promise.all(
      viewedProfiles.map(async (view) => {
        const profile = await User.findById(view.profileId)
          .select('firstName lastName profilePicture headline industry company location')
          .lean();
          
        if (!profile) {
          return {
            _id: view.profileId,
            deleted: true,
            viewedAt: view.viewedAt,
            title: 'Deleted User',
            description: 'This user no longer exists'
          };
        }
        
        return {
          ...profile,
          viewedAt: view.viewedAt
        };
      })
    );
    
    res.json({
      viewedProfiles: populatedViews,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get profile view activity error:', error);
    res.status(500).json({ error: 'Error fetching profile view activity' });
  }
});
// ----------------------
// PORTFOLIO SYSTEM ROUTES
// ----------------------

// Project Routes
// Add these routes to your server.js file

// Project routes with query parameter filtering
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { userId, limit = 10, page = 1 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build the query
    let query = {};
    
    // Filter by user if provided
    if (userId) {
      query.user = userId;
    }
    
    // Execute the query with pagination
    const projects = await Project.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    // Get total count for pagination
    const total = await Project.countDocuments(query);
    
    res.json({
      items: projects,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

// Achievement routes with query parameter filtering
app.get('/api/achievements', authenticateToken, async (req, res) => {
  try {
    const { userId, limit = 10, page = 1 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build the query
    let query = {};
    
    // Filter by user if provided
    if (userId) {
      query.user = userId;
    }
    
    // Execute the query with pagination
    const achievements = await Achievement.find(query)
      .sort({ featured: -1, dateAchieved: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    // Get total count for pagination
    const total = await Achievement.countDocuments(query);
    
    res.json({
      items: achievements,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({ error: 'Error fetching achievements' });
  }
});

// Streak routes with query parameter filtering
app.get('/api/streaks', authenticateToken, async (req, res) => {
  try {
    const { userId, limit = 10, page = 1, active } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build the query
    let query = {};
    
    // Filter by user if provided
    if (userId) {
      query.user = userId;
    }
    
    // Filter by active status if provided
    if (active !== undefined) {
      query.active = active === 'true';
    }
    
    // Execute the query with pagination
    const streaks = await Streak.find(query)
      .sort({ currentStreak: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    // Get total count for pagination
    const total = await Streak.countDocuments(query);
    
    res.json({
      items: streaks,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get streaks error:', error);
    res.status(500).json({ error: 'Error fetching streaks' });
  }
});
app.post('/api/projects', authenticateToken, upload.array('attachments', 5), async (req, res) => {
  try {
    console.log('==== PROJECT CREATION REQUEST ====');
    console.log('Request body:', req.body);
    console.log('Files received:', req.files?.length || 0);
    
    // Check for projectData (from the emergency fix)
    let title, description, category, tags, status, startDate, endDate, 
        collaborators, links, milestones, visibility;
    
    if (req.body.projectData) {
      // Parse the stringified JSON data
      try {
        const projectData = JSON.parse(req.body.projectData);
        
        // Extract fields from the parsed JSON
        ({ 
          title, description, category, tags, status,
          startDate, endDate, collaborators, links,
          milestones, visibility 
        } = projectData);
        
        console.log('Extracted title from projectData:', title);
      } catch (e) {
        console.error('Error parsing projectData:', e);
      }
    } else {
      // Use regular fields
      ({ 
        title, description, category, tags, status,
        startDate, endDate, collaborators, links,
        milestones, visibility 
      } = req.body);
    }
    
    // Also check if title was sent separately
    if (!title && req.body.title) {
      title = req.body.title;
      console.log('Using title from direct form field:', title);
    }
    
    // If still no title, return error
    if (!title || title.trim() === '') {
      return res.status(400).json({ 
        error: 'Validation failed', 
        errors: { title: 'Title is required' },
        debug: {
          bodyKeys: Object.keys(req.body),
          hasProjectData: !!req.body.projectData,
          bodyTitleType: typeof req.body.title
        }
      });
    }
    
    // Process uploaded files
    const attachments = req.files ? req.files.map(file => ({
      title: file.originalname,
      fileUrl: file.path,
      fileType: file.mimetype
    })) : [];
    
    // Now create the project
    const projectData = {
      user: req.user.id,
      title: title.trim(),
      description: description || '',
      category: category || 'other',
      tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
      status: status || 'in-progress',
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      attachments,
      visibility: visibility || 'public'
    };
    
    // Add optional fields if they exist
    if (collaborators) {
      projectData.collaborators = typeof collaborators === 'string' 
        ? JSON.parse(collaborators) 
        : collaborators;
    }
    
    if (links) {
      projectData.links = typeof links === 'string' 
        ? JSON.parse(links) 
        : links;
    }
    
    if (milestones) {
      projectData.milestones = typeof milestones === 'string' 
        ? JSON.parse(milestones) 
        : milestones;
    }
    
    console.log('Final project data:', JSON.stringify(projectData, null, 2));
    
    // Create the project
    const project = await Project.create(projectData);
    
    // Return the created project
    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation failed', 
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Error creating project', 
      message: error.message 
    });
  }
});
// PROJECT ENDPOINTS
// -----------------

// Delete a project
app.delete('/api/projects/:projectId', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Ensure the user owns this project
    if (project.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this project' });
    }
    
    await Project.findByIdAndDelete(req.params.projectId);
    
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Error deleting project' });
  }
});

// Update a project
app.put('/api/projects/:projectId', authenticateToken, upload.array('attachments', 5), async (req, res) => {
  try {
    const projectId = req.params.projectId;
    
    // First check if project exists and belongs to user
    const existingProject = await Project.findById(projectId);
    
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (existingProject.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this project' });
    }
    
    // Get project data from request
    let { 
      title, description, category, tags, status,
      startDate, endDate, collaborators, links,
      milestones, visibility 
    } = req.body;
    
    // Also check if projectData was sent separately
    if (req.body.projectData) {
      try {
        const projectData = JSON.parse(req.body.projectData);
        // Extract fields from the parsed JSON
        ({ 
          title, description, category, tags, status,
          startDate, endDate, collaborators, links,
          milestones, visibility 
        } = projectData);
      } catch (e) {
        console.error('Error parsing projectData:', e);
      }
    }
    
    // Process uploaded files if any
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        title: file.originalname,
        fileUrl: file.path,
        fileType: file.mimetype
      }));
    }
    
    // Prepare update data
    const updateData = {
      title: title || existingProject.title,
      description: description || existingProject.description,
      category: category || existingProject.category,
      status: status || existingProject.status,
      visibility: visibility || existingProject.visibility
    };
    
    // Add optional fields if they exist
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (tags) updateData.tags = typeof tags === 'string' ? tags.split(',') : tags;
    
    if (collaborators) {
      updateData.collaborators = typeof collaborators === 'string' 
        ? JSON.parse(collaborators) 
        : collaborators;
    }
    
    if (links) {
      updateData.links = typeof links === 'string' 
        ? JSON.parse(links) 
        : links;
    }
    
    if (milestones) {
      updateData.milestones = typeof milestones === 'string' 
        ? JSON.parse(milestones) 
        : milestones;
    }
    
    // Only add new attachments if provided
    if (attachments.length > 0) {
      updateData.attachments = [...(existingProject.attachments || []), ...attachments];
    }
    
    // Update the project
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      updateData,
      { new: true }
    );
    
    res.json(updatedProject);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Error updating project' });
  }
});

// Get a specific project
app.get('/api/projects/:projectId', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user has permission to view this project
    if (project.visibility === 'private' && project.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this project' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Error fetching project' });
  }
});

// ACHIEVEMENT ENDPOINTS
// --------------------

// Delete an achievement
app.delete('/api/achievements/:achievementId', authenticateToken, async (req, res) => {
  try {
    const achievement = await Achievement.findById(req.params.achievementId);
    
    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }
    
    // Ensure the user owns this achievement
    if (achievement.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this achievement' });
    }
    
    await Achievement.findByIdAndDelete(req.params.achievementId);
    
    res.json({ success: true, message: 'Achievement deleted successfully' });
  } catch (error) {
    console.error('Delete achievement error:', error);
    res.status(500).json({ error: 'Error deleting achievement' });
  }
});

// Update an achievement
app.put('/api/achievements/:achievementId', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const achievementId = req.params.achievementId;
    
    // First check if achievement exists and belongs to user
    const existingAchievement = await Achievement.findById(achievementId);
    
    if (!existingAchievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }
    
    if (existingAchievement.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this achievement' });
    }
    
    // Get achievement data from request
    const {
      title, description, category, dateAchieved,
      issuer, certificateUrl, verificationUrl, 
      expirationDate, visibility, featured
    } = req.body;
    
    // Prepare update data
    const updateData = {};
    
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (dateAchieved) updateData.dateAchieved = new Date(dateAchieved);
    if (issuer) updateData.issuer = issuer;
    if (certificateUrl) updateData.certificateUrl = certificateUrl;
    if (verificationUrl) updateData.verificationUrl = verificationUrl;
    if (expirationDate) updateData.expirationDate = new Date(expirationDate);
    if (visibility) updateData.visibility = visibility;
    if (featured !== undefined) updateData.featured = featured === 'true' || featured === true;
    
    // Add new image if provided
    if (req.file) {
      updateData.image = req.file.path;
    }
    
    // Update the achievement
    const updatedAchievement = await Achievement.findByIdAndUpdate(
      achievementId,
      updateData,
      { new: true }
    );
    
    res.json(updatedAchievement);
  } catch (error) {
    console.error('Update achievement error:', error);
    res.status(500).json({ error: 'Error updating achievement' });
  }
});

// Get a specific achievement
app.get('/api/achievements/:achievementId', authenticateToken, async (req, res) => {
  try {
    const achievement = await Achievement.findById(req.params.achievementId);
    
    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }
    
    // Check if user has permission to view this achievement
    if (achievement.visibility === 'private' && achievement.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this achievement' });
    }
    
    res.json(achievement);
  } catch (error) {
    console.error('Get achievement error:', error);
    res.status(500).json({ error: 'Error fetching achievement' });
  }
});

// STREAK ENDPOINTS
// ---------------

// Delete a streak
app.delete('/api/streaks/:streakId', authenticateToken, async (req, res) => {
  try {
    const streak = await Streak.findById(req.params.streakId);
    
    if (!streak) {
      return res.status(404).json({ error: 'Streak not found' });
    }
    
    // Ensure the user owns this streak
    if (streak.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this streak' });
    }
    
    await Streak.findByIdAndDelete(req.params.streakId);
    
    res.json({ success: true, message: 'Streak deleted successfully' });
  } catch (error) {
    console.error('Delete streak error:', error);
    res.status(500).json({ error: 'Error deleting streak' });
  }
});

// Update a streak
app.put('/api/streaks/:streakId', authenticateToken, async (req, res) => {
  try {
    const streakId = req.params.streakId;
    
    // First check if streak exists and belongs to user
    const existingStreak = await Streak.findById(streakId);
    
    if (!existingStreak) {
      return res.status(404).json({ error: 'Streak not found' });
    }
    
    if (existingStreak.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this streak' });
    }
    
    // Get streak data from request
    const {
      title, description, category, target, customFrequency,
      activity, visibility, reminderTime
    } = req.body;
    
    // Parse custom frequency if provided
    let parsedCustomFrequency;
    if (customFrequency) {
      try {
        parsedCustomFrequency = typeof customFrequency === 'string' 
          ? JSON.parse(customFrequency) 
          : customFrequency;
      } catch (e) {
        console.error('Error parsing customFrequency:', e);
      }
    }
    
    // Prepare update data
    const updateData = {};
    
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (target) updateData.target = target;
    if (parsedCustomFrequency) updateData.customFrequency = parsedCustomFrequency;
    if (activity) updateData.activity = activity;
    if (visibility) updateData.visibility = visibility;
    if (reminderTime) updateData.reminderTime = new Date(reminderTime);
    
    // Update the streak
    const updatedStreak = await Streak.findByIdAndUpdate(
      streakId,
      updateData,
      { new: true }
    );
    
    res.json(updatedStreak);
  } catch (error) {
    console.error('Update streak error:', error);
    res.status(500).json({ error: 'Error updating streak' });
  }
});

// Get a specific streak
app.get('/api/streaks/:streakId', authenticateToken, async (req, res) => {
  try {
    const streak = await Streak.findById(req.params.streakId);
    
    if (!streak) {
      return res.status(404).json({ error: 'Streak not found' });
    }
    
    // Check if user has permission to view this streak
    if (streak.visibility === 'private' && streak.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this streak' });
    }
    
    res.json(streak);
  } catch (error) {
    console.error('Get streak error:', error);
    res.status(500).json({ error: 'Error fetching streak' });
  }
});

// Check in to a streak
app.post('/api/streaks/:streakId/checkin', authenticateToken, upload.single('evidence'), async (req, res) => {
  try {
    const { notes } = req.body;
    const streakId = req.params.streakId;
    
    // Find the streak
    const streak = await Streak.findById(streakId);
    
    if (!streak) {
      return res.status(404).json({ error: 'Streak not found' });
    }
    
    // Ensure the user owns this streak
    if (streak.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to check in to this streak' });
    }
    
    // Check if already checked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCheckIn = streak.checkIns.find(checkIn => {
      const checkInDate = new Date(checkIn.date);
      checkInDate.setHours(0, 0, 0, 0);
      return checkInDate.getTime() === today.getTime();
    });
    
    if (todayCheckIn) {
      return res.status(400).json({ error: 'Already checked in today' });
    }
    
    // Get evidence file if uploaded
    const evidenceUrl = req.file ? req.file.path : null;
    
    // Add check-in
    streak.checkIns.push({
      date: new Date(),
      completed: true,
      notes: notes || '',
      evidence: evidenceUrl
    });
    
    // Update streak calculations
    const lastCheckIn = streak.checkIns.length > 1 
      ? streak.checkIns[streak.checkIns.length - 2] 
      : null;
    
    if (lastCheckIn) {
      const lastCheckInDate = new Date(lastCheckIn.date);
      const todayDate = new Date();
      
      // Calculate days difference
      const timeDiff = Math.abs(todayDate.getTime() - lastCheckInDate.getTime());
      const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
      
      if (dayDiff <= 1) {
        // Consecutive day, increment streak
        streak.currentStreak += 1;
      } else {
        // Streak broken, reset
        streak.currentStreak = 1;
      }
    } else {
      // First check-in
      streak.currentStreak = 1;
    }
    
    // Update longest streak if needed
    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }
    
    // Increment total completions
    streak.totalCompletions += 1;
    
    // Save the updated streak
    await streak.save();
    
    res.json(streak);
  } catch (error) {
    console.error('Streak check-in error:', error);
    res.status(500).json({ error: 'Error checking in to streak' });
  }
});
// Streak Routes
app.post('/api/streaks', authenticateToken, async (req, res) => {
  try {
    const {
      title, description, category, target, customFrequency,
      activity, startDate, visibility, reminderTime
    } = req.body;
    
    let parsedCustomFrequency;
    if (customFrequency) {
      try {
        parsedCustomFrequency = typeof customFrequency === 'string' 
          ? JSON.parse(customFrequency) 
          : customFrequency;
      } catch (e) {
        console.error('Error parsing customFrequency:', e);
      }
    }
    
    const streak = await Streak.create({
      user: req.user.id,
      title,
      description,
      category,
      target,
      customFrequency: parsedCustomFrequency,
      activity,
      startDate: startDate ? new Date(startDate) : new Date(),
      visibility,
      reminderTime: reminderTime ? new Date(reminderTime) : undefined
    });
    
    res.status(201).json(streak);
  } catch (error) {
    console.error('Create streak error:', error);
    res.status(500).json({ error: 'Error creating streak' });
  }
});

// Achievement Routes
app.post('/api/achievements', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const {
      title, description, category, dateAchieved,
      issuer, certificateUrl, verificationUrl, 
      expirationDate, visibility, featured
    } = req.body;
    
    const achievement = await Achievement.create({
      user: req.user.id,
      title,
      description,
      category,
      dateAchieved: new Date(dateAchieved),
      issuer,
      certificateUrl,
      verificationUrl,
      expirationDate: expirationDate ? new Date(expirationDate) : undefined,
      image: req.file ? req.file.path : req.body.image,
      visibility,
      featured: featured === 'true' || featured === true
    });
    
    res.status(201).json(achievement);
  } catch (error) {
    console.error('Create achievement error:', error);
    res.status(500).json({ error: 'Error creating achievement' });
  }
});

// ----------------------
// COMPANY ROUTES
// ----------------------

app.post('/api/companies', authenticateToken, upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      name, description, website,
      industry, size, founded, headquarters, locations
    } = req.body;
    
    let parsedHeadquarters;
    if (headquarters) {
      try {
        parsedHeadquarters = typeof headquarters === 'string' 
          ? JSON.parse(headquarters) 
          : headquarters;
      } catch (e) {
        console.error('Error parsing headquarters:', e);
      }
    }
    
    let parsedLocations;
    if (locations) {
      try {
        parsedLocations = typeof locations === 'string' 
          ? JSON.parse(locations) 
          : locations;
      } catch (e) {
        console.error('Error parsing locations:', e);
        parsedLocations = [];
      }
    }
    
    const company = await Company.create({
      name,
      description,
      logo: req.files && req.files.logo ? req.files.logo[0].path : null,
      coverImage: req.files && req.files.coverImage ? req.files.coverImage[0].path : null,
      website,
      industry,
      size,
      founded: parseInt(founded),
      headquarters: parsedHeadquarters,
      locations: parsedLocations || [],
      admins: [req.user.id],
      employees: [{
        user: req.user.id,
        position: 'Founder',
        verified: true
      }]
    });
    
    res.status(201).json(company);
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ error: 'Error creating company' });
  }
});

// ----------------------
// DATABASE CONNECTION AND SERVER START
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const server = http.createServer(app);

// Create Socket.IO server with CORS configuration


// Connected users mapping





mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/professionals_network')
  .then(() => {
    console.log('Connected to MongoDB');
      // async function clearDatabase() {
      //   await Post.deleteMany({});

      //   console.log("Database cleared!");
      //   mongoose.connection.close();
      // }
      // clearDatabase()
    // Create HTTP server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\nServer running on port ${PORT}`);
  
      // In your server.js or socket configuration file
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',   // Development frontend URL
      'http://localhost:3000',   // If your backend is also serving frontend
      /\.yourdomain\.com$/       // Production domain pattern
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  },
  path: '/socket.io/',            // Explicit socket path
  pingTimeout: 60000,             // Increased timeout
  pingInterval: 25000             // Ping interval
});

// Enhanced authentication middleware
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token || 
                 socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }
    
    // More robust token verification
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '30d'
    });
    
    // Additional validation
    if (!decoded.id) {
      return next(new Error('Invalid token payload'));
    }
    
    socket.userId = decoded.id;
    socket.userEmail = decoded.email;
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error(`Authentication failed: ${error.message}`));
  }
});
      const nets = networkInterfaces();
      console.log('\nServer accessible at:');
      console.log(`- Local: ${BASE_URL}`);
      
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            console.log(`- Network: http://${net.address}:${PORT}`);
          }
        }
      }
      // Near the top of your file where Cloudinary is set up
console.log('Cloudinary config status:', !!cloudinary.config().cloud_name);
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Authenticate socket connection
  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      if (!token) {
        socket.emit('auth_error', { message: 'No token provided' });
        return;
      }
      
      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      
      // Join user-specific room
      socket.join(`user_${decoded.id}`);
      
      // Update user online status
      await User.findByIdAndUpdate(decoded.id, {
        online: true,
        lastActive: new Date()
      });
      
      // Get user's chats and join those rooms
      const chats = await ChatRoom.find({
        participants: decoded.id
      });
      
      chats.forEach(chat => {
        socket.join(`chat_${chat._id}`);
      });
      
      // Get user's groups and join those rooms
      const groups = await Group.find({
        'members.user': decoded.id
      });
      
      groups.forEach(group => {
        socket.join(`group_${group._id}`);
      });
      
      socket.emit('authenticated', { userId: decoded.id });
      
      // Notify connections that user is online
      const user = await User.findById(decoded.id);
      if (user && user.connections) {
        io.to(user.connections.map(id => `user_${id}`)).emit('user_online', {
          userId: decoded.id,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('auth_error', { message: 'Authentication failed' });
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    
    if (socket.userId) {
      // Update user offline status
      await User.findByIdAndUpdate(socket.userId, {
        online: false,
        lastActive: new Date()
      });
      
      // Notify connections that user is offline
      const user = await User.findById(socket.userId);
      if (user && user.connections) {
        io.to(user.connections.map(id => `user_${id}`)).emit('user_offline', {
          userId: socket.userId,
          timestamp: new Date()
        });
      }
    }
  });
  
  // Handle typing indicators
  socket.on('typing', (data) => {
    const { chatId, isTyping } = data;
    
    if (!socket.userId || !chatId) return;
    
    socket.to(`chat_${chatId}`).emit('typing_indicator', {
      chatId,
      userId: socket.userId,
      isTyping
    });
  });
  
  // Handle location sharing
  socket.on('share_location', async (data) => {
    const { coordinates, accuracy } = data;
    
    if (!socket.userId || !coordinates) return;
    
    try {
      const user = await User.findById(socket.userId);
      
      // Check if location sharing is enabled
      if (!user.locationSharing || !user.locationSharing.enabled) {
        socket.emit('location_error', { 
          message: 'Location sharing is not enabled' 
        });
        return;
      }
      
      // Update user location
      await User.findByIdAndUpdate(socket.userId, {
        $set: {
          'location.coordinates': coordinates,
          'location.accuracy': accuracy,
          'location.lastUpdated': new Date()
        }
      });
      
      // Determine recipients
      let recipients = [];
      
      if (user.locationSharing.visibleTo === 'connections') {
        recipients = user.connections || [];
      } else if (user.locationSharing.visibleTo === 'selected') {
        recipients = user.locationSharing.selectedUsers || [];
      }
      
      // Emit location update to recipients
      io.to(recipients.map(id => `user_${id}`)).emit('location_update', {
        userId: socket.userId,
        coordinates,
        accuracy,
        timestamp: new Date()
      });
      
      socket.emit('location_shared', { success: true });
    } catch (error) {
      console.error('Location sharing error:', error);
      socket.emit('location_error', { 
        message: 'Error sharing location' 
      });
    }
  });
});

    });
  
    // Initialize WebSocket Server
 

   //Continuing with WebSocket connection handling from part 4

// WebSocVket heartbeat
app.post('/api/location/continuous-update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, accuracy, heading, speed } = req.body;

    // Validate input
    if (!latitude || !longitude) {
      return res.status(400).json({ msg: 'Latitude and longitude are required' });
    }

    // Update user location
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        'location.coordinates': [longitude, latitude], // GeoJSON format: [lng, lat]
        'location.accuracy': accuracy || null,
        'location.heading': heading || null,
        'location.speed': speed || null,
        'location.lastUpdated': new Date()
      },
      { new: true }
    );

    // Get the location tracker instance
    const locationTracker = req.app.get('locationTracker');
    if (locationTracker && !locationTracker.trackingIntervals.has(userId)) {
      // Start tracking if not already tracking
      locationTracker.startTracking(userId);
    }

    res.json({ 
      msg: 'Location updated successfully',
      location: updatedUser.location
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});


// Error handling middleware
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});
})

module.exports = app;

