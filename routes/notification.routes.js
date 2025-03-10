// routes/notification.routes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller.js');
const { authenticateToken } = require('../middleware/auth.middleware.js');

// Get notifications
router.get('/', authenticateToken, notificationController.getNotifications);
router.get('/unread-count', authenticateToken, notificationController.getUnreadCount);
router.get('/settings', authenticateToken, notificationController.getNotificationSettings);

// Mark notifications as read
router.put('/mark-read', authenticateToken, notificationController.markAsRead);
router.put('/:id/read', authenticateToken, notificationController.markOneAsRead);

// Update notification settings
router.put('/settings', authenticateToken, notificationController.updateNotificationSettings);

// Delete notification
router.delete('/:id', authenticateToken, notificationController.deleteNotification);

module.exports = router;