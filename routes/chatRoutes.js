const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const protect = require("../middleware/authMiddleware");
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary storage for chat attachments
const chatAttachmentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_attachments',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
    transformation: [
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Create upload middleware for chat attachments
const chatUpload = multer({
  storage: chatAttachmentStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB file size limit
    files: 1 // Only one file per message
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 
      'video/mp4', 'video/quicktime',
      'application/pdf', 
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, and common document formats are allowed.'), false);
    }
  }
});
router.post('/', protect, chatController.createChat);
router.get('/', protect, chatController.getChats);
router.get('/:chatId', protect, chatController.getChatById);

// Message routes
router.post('/:chatId/messages', protect, chatUpload.single('media'), chatController.sendMessage);
router.get('/:chatId/messages', protect, chatController.getMessages);
router.delete('/:chatId/messages/:messageId', protect, chatController.deleteMessage);
router.post('/:chatId/messages/:messageId/react', protect, chatController.reactToMessage);

// Poll routes
router.post('/:chatId/polls', protect, chatController.createPoll);
router.post('/:chatId/polls/:pollId/vote', protect, chatController.votePoll);

// Call routes
router.post('/:chatId/call', protect, chatController.initializeCall);
router.post('/:chatId/call/:callId/accept', protect, chatController.acceptCall);
router.post('/:chatId/call/:callId/end', protect, chatController.endCall);

module.exports = router;