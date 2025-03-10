/**
 * Professional Network App - Server Entry Point
 */
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const { networkInterfaces } = require('os');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Connect to database
require('./config/db');

// Load passport configuration
require('./config/passport');

// CORS setup
app.use(cors({
  origin: [
    'https://meetkats.com',
    'https://meetkats.com/',
    'http://localhost:3000'  // Development
  ],
  credentials: true
}));

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Required for OAuth state cookies

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
  const { requestLogger } = require('./middleware/error.middleware');
  app.use(requestLogger);
}

// Static files (if any)
app.use(express.static(path.join(__dirname, 'public')));

// Import individual route modules
const authRoutes = require('./routes/auth.routes.js');
const userRoutes = require('./routes/user.routes.js');
const postRoutes = require('./routes/post.routes.js');
const chatRoutes = require('./routes/chat.routes.js');
const eventRoutes = require('./routes/event.routes.js');
const jobRoutes = require('./routes/job.routes.js');
const storyRoutes = require('./routes/story.routes.js');
const portfolioRoutes = require('./routes/portfolio.routes.js');
const notificationRoutes = require('./routes/notification.routes.js');

// Mount auth routes at root level
app.use('/auth', authRoutes); // This is the critical change for OAuth flows

// Mount API routes
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// API root health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Log registered routes in development
if (process.env.NODE_ENV !== 'production') {
  console.log('\nRegistered Routes:');
  // This is a simple route logging implementation
  const printRoutes = (stack, basePath = '') => {
    stack.forEach(layer => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(',');
        console.log(`${methods} ${basePath}${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle.stack) {
        const path = layer.regexp.toString()
          .replace('\\/?(?=\\/|$)', '')
          .replace('^\\', '')
          .replace('\\/?$', '')
          .replace(/\\\//g, '/');
        
        // Extract the base path from the regexp
        let routerPath = path.replace(/^\^\\\/|\/\?\(\?=\\\/\|\$\)$/g, '');
        routerPath = routerPath.replace(/\\\//g, '/');
        printRoutes(layer.handle.stack, `/${routerPath}`);
      }
    });
  };
  
  printRoutes(app._router.stack);
}

// Error handling middleware
const { notFound, errorHandler } = require('./middleware/error.middleware');
app.use(notFound);
app.use(errorHandler);

// Create HTTP server
const server = http.createServer(app);

// Socket.io setup with CORS configuration
const io = new Server(server, {
  cors: {
    origin: [
      'https://meetkats.com',
      'https://meetkats.com/',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  },
  path: '/socket.io/',
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize socket connections
require('./socket')(io);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nServer running on port ${PORT}`);
  
  // Log accessible URLs
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
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`- Production URL: ${BASE_URL}`);
    console.log(`- Auth callback URL: ${BASE_URL}/auth/google/callback`);
  }
  
  // Additional environment info
  console.log(`\nEnvironment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Auth configured: ${!!process.env.GOOGLE_CLIENT_ID ? 'Yes' : 'No'}`);
  console.log(`Cloudinary configured: ${!!process.env.CLOUDINARY_CLOUD_NAME ? 'Yes' : 'No'}`);
  
  console.log('\nServer initialized successfully');
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = server; // For testing purposes
