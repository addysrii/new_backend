const express = require('express');
const router = express.Router();
const storyController = require('../controllers/story.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const fileUploadService = require('../services/file-upload.service');

// Create a story
router.post('/', authenticateToken, fileUploadService.storyUpload.single('media'), storyController.createStory);

// Get stories
router.get('/', authenticateToken, storyController.getStories);

// Mark story as viewed
router.post('/:storyId/view', authenticateToken, storyController.viewStory);

// React to a story
router.post('/:storyId/react', authenticateToken, storyController.reactToStory);

// Reply to a story
router.post('/:storyId/reply', authenticateToken, storyController.replyToStory);

// Create highlight
router.post('/highlights', authenticateToken, storyController.createHighlight);

// Get user's highlights
router.get('/highlights/:userId', authenticateToken, storyController.getUserHighlights);

module.exports = router;
