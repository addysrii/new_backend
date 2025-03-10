const fileUploadService = require('../services/file-upload.service.js');

/**
 * Middleware for profile picture uploads
 */
exports.uploadProfilePicture = fileUploadService.profileUpload.single('profileImage');

/**
 * Middleware for post media uploads
 */
exports.uploadPostMedia = fileUploadService.postUpload.array('media', 10);

/**
 * Middleware for story uploads
 */
exports.uploadStory = fileUploadService.storyUpload.single('media');

/**
 * Middleware for chat attachment uploads
 */
exports.uploadChatAttachment = fileUploadService.chatUpload.single('media');

/**
 * Process upload errors
 */
exports.handleUploadErrors = (err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      success: false,
      error: 'File is too large' 
    });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ 
      success: false,
      error: 'Too many files uploaded' 
    });
  }
  
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ 
      success: false,
      error: err.message 
    });
  }
  
  // Pass to next error handler
  next(err);
};
