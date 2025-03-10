// routes/index.js
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const postRoutes = require('./post.routes');
const chatRoutes = require('./chat.routes');
const eventRoutes = require('./event.routes');
const jobRoutes = require('./job.routes');
const storyRoutes = require('./story.routes');
const portfolioRoutes = require('./portfolio.routes');
const notificationRoutes = require('./notification.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/chats', chatRoutes);
router.use('/events', eventRoutes);
router.use('/jobs', jobRoutes);
router.use('/stories', storyRoutes);
router.use('/portfolio', portfolioRoutes);
router.use('/notifications', notificationRoutes);

// Health check route for API
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;