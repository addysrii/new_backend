// middleware/error.middleware.js
/**
 * Global error handler middleware
 */
exports.errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    
    // Default error status and message
    let statusCode = 500;
    let message = 'Server error';
    
    // Handle different types of errors
    if (err.name === 'ValidationError') {
      // Mongoose validation error
      statusCode = 400;
      message = Object.values(err.errors).map(val => val.message).join(', ');
    } else if (err.name === 'CastError') {
      // Mongoose cast error (e.g., invalid ObjectId)
      statusCode = 400;
      message = 'Invalid ID format';
    } else if (err.code === 11000) {
      // Mongoose duplicate key error
      statusCode = 409;
      message = 'Duplicate entry';
    } else if (err.name === 'JsonWebTokenError') {
      // JWT verification error
      statusCode = 401;
      message = 'Invalid token';
    } else if (err.name === 'TokenExpiredError') {
      // JWT expiration error
      statusCode = 401;
      message = 'Token expired';
    } else if (err.statusCode) {
      // Custom error with status code
      statusCode = err.statusCode;
      message = err.message;
    }
    
    // Send error response
    res.status(statusCode).json({
      success: false,
      error: message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
  };
  
  /**
   * 404 Not Found middleware
   */
  exports.notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.statusCode = 404;
    next(error);
  };
  
  /**
   * Request logger middleware
   */
  exports.requestLogger = (req, res, next) => {
    const start = Date.now();
    
    // Log the request
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    
    // Once the request is processed, log the response time
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    
    next();
  };
  