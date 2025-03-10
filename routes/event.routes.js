// routes/event.routes.js
const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event.controller.js');
const { authenticateToken } = require('../middleware/auth.middleware.js');
const fileUploadService = require('../services/file-upload.service.js');
const { validateRequest, eventValidationRules } = require('../middleware/validation.middleware.js');

// Get events and event categories
router.get('/', authenticateToken, eventController.getEvents);
router.get('/nearby', authenticateToken, eventController.getNearbyEvents);
router.get('/categories', authenticateToken, eventController.getEventCategories);
router.get('/:id', authenticateToken, eventController.getEventById);
router.get('/:id/attendees', authenticateToken, eventController.getEventAttendees);

// Create and manage events
router.post('/', 
  authenticateToken, 
  fileUploadService.imageUpload.single('coverImage'),
  eventValidationRules(), 
  validateRequest,
  eventController.createEvent
);

router.put('/:id', 
  authenticateToken, 
  fileUploadService.imageUpload.single('coverImage'),
  eventController.updateEvent
);

router.delete('/:id', authenticateToken, eventController.deleteEvent);

// Event attendance and interactions
router.post('/:id/respond', authenticateToken, eventController.respondToEvent);
router.post('/:id/invite', authenticateToken, eventController.inviteToEvent);
router.post('/:id/check-in', authenticateToken, eventController.checkInToEvent);
router.post('/:id/share', authenticateToken, eventController.shareEvent);

module.exports = router;