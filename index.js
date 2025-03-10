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

// API routes
const routes = require('./routes');
app.use('/api', routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

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
  }
  
  // Additional environment info
  console.log(`\nEnvironment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Cloudinary configured: ${!!process.env.CLOUDINARY_CLOUD_NAME}`);
  
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