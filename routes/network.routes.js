// routes/network.routes.js
const express = require('express');
const router = express.Router();
const networkController = require('../controllers/network.controller.js');
const { authenticateToken, rateLimiter } = require('../middleware/auth.middleware.js');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get nearby professionals
router.get('/nearby', networkController.getNearbyProfessionals);

// Get user connections
router.get('/connections', networkController.getConnections);

// Get pending connection requests
router.get('/connection-requests', networkController.getConnectionRequests);

// Send connection request
router.post('/connection-request', networkController.sendConnectionRequest);

// Accept or decline connection request
router.post('/connection-response', networkController.respondToConnectionRequest);

// Remove connection
router.post('/remove-connection', networkController.removeConnection);

module.exports = router;
