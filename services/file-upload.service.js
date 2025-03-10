// services/file-upload.service.js
const { cloudinary, dpUpload, postUpload, storyUpload, chatUpload,imageUpload,evidenceUpload } = require('../config/cloudinary.js');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);

/**
 * FileUploadService - Handles file uploads to cloud storage
 */
class FileUploadService {
  constructor() {
    // Initialize cloudinary configuration from the imported config
    this.cloudinary = cloudinary;
    
    // Initialize multer upload configurations
    this.profileUpload = dpUpload;
    this.postUpload = postUpload;
    this.storyUpload = storyUpload;
    this.chatUpload = chatUpload;
    this.imageUpload = imageUpload;
    this.evidenceUpload = evidenceUpload;
  }
  
  /**
   * Upload a single file to cloudinary
   * @param {Object} file The file object from multer
   * @param {String} folder The destination folder in cloudinary
   * @param {Object} options Additional upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(file, folder = 'uploads', options = {}) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }
      
      // Set default options
      const uploadOptions = {
        folder,
        resource_type: 'auto',
        ...options
      };
      
      // Upload the file
      const result = await this.cloudinary.uploader.upload(file.path, uploadOptions);
      
      // Delete local file after upload
      if (file.path && fs.existsSync(file.path)) {
        await unlinkAsync(file.path);
      }
      
      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        type: result.resource_type,
        width: result.width,
        height: result.height,
        size: file.size
      };
    } catch (error) {
      console.error('File upload error:', error);
      
      // Delete local file in case of error
      if (file && file.path && fs.existsSync(file.path)) {
        await unlinkAsync(file.path).catch(err => console.error('Error deleting local file:', err));
      }
      
      throw error;
    }
  }
  
  /**
   * Upload multiple files to cloudinary
   * @param {Array} files Array of file objects from multer
   * @param {String} folder The destination folder in cloudinary
   * @param {Object} options Additional upload options
   * @returns {Promise<Array>} Array of upload results
   */
  async uploadMultipleFiles(files, folder = 'uploads', options = {}) {
    try {
      if (!files || !Array.isArray(files) || files.length === 0) {
        throw new Error('No files provided');
      }
      
      // Upload all files in parallel
      const uploadPromises = files.map(file => this.uploadFile(file, folder, options));
      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error('Multiple files upload error:', error);
      throw error;
    }
  }
  
  /**
   * Delete a file from cloudinary
   * @param {String} publicId The public ID of the file
   * @param {String} resourceType The resource type (image, video, raw)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(publicId, resourceType = 'image') {
    try {
      if (!publicId) {
        throw new Error('No public ID provided');
      }
      
      return await this.cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
      console.error('File deletion error:', error);
      throw error;
    }
  }
  
  /**
   * Generate a signed upload URL for direct client-side uploads
   * @param {Object} options Upload options
   * @returns {Promise<Object>} Signed upload parameters
   */
  generateSignedUploadParams(options = {}) {
    try {
      const timestamp = Math.round((new Date).getTime() / 1000);
      
      // Default options
      const params = {
        timestamp,
        folder: options.folder || 'uploads',
        ...options
      };
      
      // Generate signature
      const signature = this.cloudinary.utils.api_sign_request(params, 
        process.env.CLOUDINARY_API_SECRET);
      
      // Return parameters for client upload
      return {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        timestamp,
        signature,
        folder: params.folder
      };
    } catch (error) {
      console.error('Generate signed upload error:', error);
      throw error;
    }
  }
  
  /**
   * Create a download URL for a private file
   * @param {String} publicId The public ID of the file
   * @param {Object} options Download options
   * @returns {String} Signed download URL
   */
  generateDownloadUrl(publicId, options = {}) {
    try {
      if (!publicId) {
        throw new Error('No public ID provided');
      }
      
      // Default options
      const downloadOptions = {
        type: 'private',
        resource_type: 'auto',
        expires_at: Math.round(Date.now() / 1000) + 3600, // 1 hour expiration
        ...options
      };
      
      // Generate URL
      return this.cloudinary.url(publicId, downloadOptions);
    } catch (error) {
      console.error('Generate download URL error:', error);
      throw error;
    }
  }
}

module.exports = new FileUploadService();