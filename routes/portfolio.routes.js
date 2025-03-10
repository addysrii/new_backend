const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolio.controller.js');
const { authenticateToken } = require('../middleware/auth.middleware.js');
const fileUploadService = require('../services/file-upload.service.js');

// Projects
router.post('/projects', authenticateToken, fileUploadService.postUpload.array('attachments', 5), portfolioController.createProject);
router.get('/projects', authenticateToken, portfolioController.getUserProjects);
// You need to implement getProjectById in your controller
// router.get('/projects/:projectId', authenticateToken, portfolioController.getProjectById);
router.put('/projects/:projectId', authenticateToken, fileUploadService.postUpload.array('attachments', 5), portfolioController.updateProject);
router.delete('/projects/:projectId', authenticateToken, portfolioController.deleteProject);

// Achievements
router.post('/achievements', authenticateToken, fileUploadService.postUpload.single('image'), portfolioController.createAchievement);
router.get('/achievements', authenticateToken, portfolioController.getUserAchievements);
// You need to implement getAchievementById in your controller
// router.get('/achievements/:achievementId', authenticateToken, portfolioController.getAchievementById);
router.put('/achievements/:achievementId', authenticateToken, fileUploadService.postUpload.single('image'), portfolioController.updateAchievement);
router.delete('/achievements/:achievementId', authenticateToken, portfolioController.deleteAchievement);

// Streaks
router.post('/streaks', authenticateToken, portfolioController.createStreak);
router.get('/streaks', authenticateToken, portfolioController.getUserStreaks);
// You need to implement getStreakById in your controller
// router.get('/streaks/:streakId', authenticateToken, portfolioController.getStreakById);
router.put('/streaks/:streakId', authenticateToken, portfolioController.updateStreak);
router.delete('/streaks/:streakId', authenticateToken, portfolioController.deleteStreak);
router.post('/streaks/:streakId/checkin', authenticateToken, fileUploadService.postUpload.single('evidence'), portfolioController.checkInToStreak);

module.exports = router;