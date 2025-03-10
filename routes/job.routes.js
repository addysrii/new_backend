// routes/job.routes.js
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/job.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const fileUploadService = require('../services/file-upload.service');
const { validateRequest, jobValidationRules } = require('../middleware/validation.middleware');

// Get jobs
router.get('/', authenticateToken, jobController.getJobs);
router.get('/saved', authenticateToken, jobController.getSavedJobs);
router.get('/recommended', authenticateToken, jobController.getRecommendedJobs);
router.get('/types', authenticateToken, jobController.getJobMetadata);
router.get('/:id', authenticateToken, jobController.getJobById);
router.get('/:id/applications', authenticateToken, jobController.getJobApplications);

// Create and manage jobs
router.post('/',
  authenticateToken,
  jobValidationRules(),
  validateRequest,
  jobController.createJob
);

router.put('/:id',
  authenticateToken,
  jobController.updateJob
);

router.delete('/:id', authenticateToken, jobController.deleteJob);

// Job applications
router.post('/:id/apply',
  authenticateToken,
  fileUploadService.imageUpload.single('resume'),
  jobController.applyToJob
);

router.put('/:id/applications/:applicationId',
  authenticateToken,
  jobController.updateApplicationStatus
);

// Save/bookmark jobs
router.post('/:id/save', authenticateToken, jobController.saveJob);

module.exports = router;