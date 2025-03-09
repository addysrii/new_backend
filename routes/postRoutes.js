const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { authenticateToken, isResourceOwner } = require('../middleware/auth');
const { postUpload } = require('../config/cloudinary');

// Get all posts (with pagination and filtering)
router.get('/', authenticateToken, postController.getPosts);

// Get trending posts
router.get('/trending', authenticateToken, postController.getTrendingPosts);

// Create a new post (with media upload)
router.post('/', authenticateToken, postUpload.array('media', 10), postController.createPost);

// Get a single post by ID
router.get('/:id', authenticateToken, postController.getPostById);

// Update a post
router.put('/:id', authenticateToken, isResourceOwner('Post', 'id'), postController.updatePost);

// Delete a post
router.delete('/:id', authenticateToken, isResourceOwner('Post', 'id'), postController.deletePost);

// React to a post (like, love, etc.)
router.post('/:id/react', authenticateToken, postController.reactToPost);

// Bookmark a post
router.post('/:id/bookmark', authenticateToken, postController.bookmarkPost);

// Comment related routes
router.post('/:id/comments', authenticateToken, postController.addComment);
router.delete('/:id/comments/:commentId', authenticateToken, postController.deleteComment);

module.exports = router;