// routes/portfolio.routes.js
const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolio.controller.js');
const { authenticateToken } = require('../middleware/auth.middleware.js');
const fileUploadService = require('../services/file-upload.service.js');

// Projects
router.get('/projects', authenticateToken, portfolioController.getUserProjects);
router.post('/projects',
  authenticateToken,
  fileUploadService.imageUpload.single('image'),
  portfolioController.createProject
);
router.put('/projects/:id',
  authenticateToken,
  fileUploadService.imageUpload.single('image'),
  portfolioController.updateProject
);
router.delete('/projects/:id', authenticateToken, portfolioController.deleteProject);

// Achievements
router.get('/achievements', authenticateToken, portfolioController.getUserAchievements);
router.post('/achievements',
  authenticateToken,
  fileUploadService.imageUpload.single('image'),
  portfolioController.createAchievement
);
router.put('/achievements/:id',
  authenticateToken,
  fileUploadService.imageUpload.single('image'),
  portfolioController.updateAchievement
);
router.delete('/achievements/:id', authenticateToken, portfolioController.deleteAchievement);
router.post('/achievements/:id/endorse', authenticateToken, portfolioController.endorseAchievement);

// Streaks
router.get('/streaks', authenticateToken, portfolioController.getUserStreaks);
router.post('/streaks', authenticateToken, portfolioController.createStreak);
router.put('/streaks/:id', authenticateToken, portfolioController.updateStreak);
router.delete('/streaks/:id', authenticateToken, portfolioController.deleteStreak);
router.post('/streaks/:id/check-in',
  authenticateToken,
  fileUploadService.evidenceUpload.single('evidence'),
  portfolioController.checkInToStreak
);
router.post('/streaks/:id/support', authenticateToken, portfolioController.supportStreak);

// Work experience and education
router.put('/experience', authenticateToken, portfolioController.updateWorkExperience);
router.put('/education', authenticateToken, portfolioController.updateEducation);
router.put('/skills', authenticateToken, portfolioController.updateSkills);
router.post('/skills/:skillId/endorse', authenticateToken, portfolioController.endorseSkill);

module.exports = router;