// routes/story.routes.js
const express = require('express');
const router = express.Router();
const storyController = require('../controllers/story.controller.js');
const { authenticateToken } = require('../middleware/auth.middleware.js');
const fileUploadService = require('../services/file-upload.service.js');

// Get stories
router.get('/', authenticateToken, storyController.getStories);
router.get('/user/:userId', authenticateToken, storyController.getUserStories);
router.get('/:id', authenticateToken, storyController.getStoryById);

// Create and interact with stories
router.post('/',
  authenticateToken,
  fileUploadService.storyUpload.single('media'),
  storyController.createStory
);

router.post('/:id/view', authenticateToken, storyController.viewStory);
router.post('/:id/react', authenticateToken, storyController.reactToStory);
router.post('/:id/reply', authenticateToken, storyController.replyToStory);

// Highlights
router.post('/highlights', authenticateToken, storyController.createHighlight);
router.get('/highlights/:userId', authenticateToken, storyController.getUserHighlights);
router.get('/highlights/:id', authenticateToken, storyController.getHighlightById);
router.put('/highlights/:id', authenticateToken, storyController.updateHighlight);
router.delete('/highlights/:id', authenticateToken, storyController.deleteHighlight);

module.exports = router;