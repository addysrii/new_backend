const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller.js');
const { authenticateToken } = require('../middleware/auth.middleware.js');
const fileUploadService = require('../services/file-upload.service.js');

// Chat rooms
router.post('/', authenticateToken, chatController.createChat);
router.get('/', authenticateToken, chatController.getChats);
router.get('/:chatId', authenticateToken, chatController.getChatById);

// Messages
router.post('/:chatId/messages', authenticateToken, 
  fileUploadService.chatUpload.single('media'), 
  chatController.sendMessage
);
router.get('/:chatId/messages', authenticateToken, chatController.getMessages);
router.delete('/:chatId/messages/:messageId', authenticateToken, chatController.deleteMessage);
router.post('/:chatId/messages/:messageId/react', authenticateToken, chatController.reactToMessage);

// Polls
router.post('/:chatId/polls', authenticateToken, chatController.createPoll);
router.post('/:chatId/polls/:pollId/vote', authenticateToken, chatController.votePoll);

// Calls
router.post('/:chatId/call', authenticateToken, chatController.initializeCall);
router.post('/:chatId/call/:callId/accept', authenticateToken, chatController.acceptCall);
router.post('/:chatId/call/:callId/end', authenticateToken, chatController.endCall);

module.exports = router;