// controllers/portfolio.controller.js
const User = require('../models/user/user.js');
const Project = require('../models/portfolio/Project.js');
const Achievement = require('../models/portfolio/achievement.js');
const Streak = require('../models/portfolio/streak.js');
const fileUploadService = require('../services/file-upload.service.js');
const mongoose = require('mongoose');

/**
 * @route   GET /api/portfolio/projects
 * @desc    Get user's projects
 * @access  Private
 */
exports.getUserProjects = async (req, res) => {
  try {
    const { userId } = req.query;
    
    // If userId provided, get that user's projects, otherwise get current user's
    const targetUserId = userId || req.user.id;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // If viewing another user's projects, check permission
    if (targetUserId !== req.user.id) {
      const targetUser = await User.findById(targetUserId);
      
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Check privacy settings
      if (targetUser.privacy?.profileVisibility === 'private') {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to view this user\'s projects'
        });
      }
      
      if (targetUser.privacy?.profileVisibility === 'connections') {
        const currentUser = await User.findById(req.user.id);
        if (!currentUser.connections || !currentUser.connections.includes(targetUserId)) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to view this user\'s projects'
          });
        }
      }
    }
    
    // Get projects
    const projects = await Project.find({ user: targetUserId })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      projects
    });
  } catch (error) {
    console.error('Get user projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching user projects'
    });
  }
};

/**
 * @route   POST /api/portfolio/projects
 * @desc    Create a new project
 * @access  Private
 */
exports.createProject = async (req, res) => {
  try {
    const { title, description, category, startDate, endDate, url, technologies } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }
    
    // Parse technologies
    let techArray = [];
    if (technologies) {
      techArray = Array.isArray(technologies) 
        ? technologies 
        : (typeof technologies === 'string' ? technologies.split(',').map(t => t.trim()) : []);
    }
    
    // Upload image if provided
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await fileUploadService.uploadFile(
        req.file,
        'projects',
        {
          transformation: [
            { width: 800, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        }
      );
      imageUrl = uploadResult.url;
    }
    
    // Create project
    const project = await Project.create({
      user: req.user.id,
      title,
      description: description || '',
      category: category || '',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      url: url || '',
      imageUrl,
      technologies: techArray,
      createdAt: new Date()
    });
    
    res.status(201).json({
      success: true,
      project
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating project'
    });
  }
};

/**
 * @route   PUT /api/portfolio/projects/:id
 * @desc    Update a project
 * @access  Private
 */
exports.updateProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const { title, description, category, startDate, endDate, url, technologies } = req.body;
    
    // Validate project ID
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid project ID'
      });
    }
    
    // Find project
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Check ownership
    if (project.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this project'
      });
    }
    
    // Parse technologies
    let techArray = project.technologies || [];
    if (technologies) {
      techArray = Array.isArray(technologies) 
        ? technologies 
        : (typeof technologies === 'string' ? technologies.split(',').map(t => t.trim()) : techArray);
    }
    
    // Upload image if provided
    if (req.file) {
      const uploadResult = await fileUploadService.uploadFile(
        req.file,
        'projects',
        {
          transformation: [
            { width: 800, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        }
      );
      project.imageUrl = uploadResult.url;
    }
    
    // Update fields
    project.title = title || project.title;
    project.description = description !== undefined ? description : project.description;
    project.category = category || project.category;
    project.startDate = startDate ? new Date(startDate) : project.startDate;
    project.endDate = endDate ? new Date(endDate) : project.endDate;
    project.url = url !== undefined ? url : project.url;
    project.technologies = techArray;
    
    await project.save();
    
    res.json({
      success: true,
      project
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating project'
    });
  }
};

/**
 * @route   DELETE /api/portfolio/projects/:id
 * @desc    Delete a project
 * @access  Private
 */
exports.deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    
    // Validate project ID
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid project ID'
      });
    }
    
    // Find project
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Check ownership
    if (project.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this project'
      });
    }
    
    // Delete project
    await Project.findByIdAndDelete(projectId);
    
    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({
      success: false,
      error: 'Error deleting project'
    });
  }
};

/**
 * @route   GET /api/portfolio/achievements
 * @desc    Get user's achievements
 * @access  Private
 */
exports.getUserAchievements = async (req, res) => {
  try {
    const { userId } = req.query;
    
    // If userId provided, get that user's achievements, otherwise get current user's
    const targetUserId = userId || req.user.id;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // If viewing another user's achievements, check permission
    if (targetUserId !== req.user.id) {
      const targetUser = await User.findById(targetUserId);
      
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Check privacy settings
      if (targetUser.privacy?.profileVisibility === 'private') {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to view this user\'s achievements'
        });
      }
      
      if (targetUser.privacy?.profileVisibility === 'connections') {
        const currentUser = await User.findById(req.user.id);
        if (!currentUser.connections || !currentUser.connections.includes(targetUserId)) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to view this user\'s achievements'
          });
        }
      }
    }
    
    // Get achievements based on visibility
    const query = {
      user: targetUserId
    };
    
    // If not own profile, only show public or appropriate visibility
    if (targetUserId !== req.user.id) {
      const currentUser = await User.findById(req.user.id);
      const isConnected = currentUser.connections && 
        currentUser.connections.includes(targetUserId);
      
      query.$or = [
        { visibility: 'public' },
        { visibility: 'connections', $and: [{ $expr: { $eq: [isConnected, true] } }] }
      ];
    }
    
    // Get achievements
    const achievements = await Achievement.find(query)
      .populate('endorsements.user', 'firstName lastName profilePicture')
      .sort({ featured: -1, dateAchieved: -1 });
    
    res.json({
      success: true,
      achievements
    });
  } catch (error) {
    console.error('Get user achievements error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching user achievements'
    });
  }
};

/**
 * @route   POST /api/portfolio/achievements
 * @desc    Create a new achievement
 * @access  Private
 */
exports.createAchievement = async (req, res) => {
  try {
    const { 
      title, 
      description, 
      category,
      dateAchieved,
      issuer,
      certificateUrl,
      verificationUrl,
      expirationDate,
      visibility,
      featured
    } = req.body;
    
    // Validate required fields
    if (!title || !dateAchieved) {
      return res.status(400).json({
        success: false,
        error: 'Title and achievement date are required'
      });
    }
    
    // Upload image if provided
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await fileUploadService.uploadFile(
        req.file,
        'achievements',
        {
          transformation: [
            { width: 800, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        }
      );
      imageUrl = uploadResult.url;
    }
    
    // Create achievement
    const achievement = await Achievement.create({
      user: req.user.id,
      title,
      description: description || '',
      category: category || '',
      dateAchieved: new Date(dateAchieved),
      issuer: issuer || '',
      certificateUrl: certificateUrl || '',
      verificationUrl: verificationUrl || '',
      expirationDate: expirationDate ? new Date(expirationDate) : null,
      image: imageUrl,
      visibility: visibility || 'public',
      featured: featured === true,
      createdAt: new Date()
    });
    
    res.status(201).json({
      success: true,
      achievement
    });
  } catch (error) {
    console.error('Create achievement error:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating achievement'
    });
  }
};

/**
 * @route   PUT /api/portfolio/achievements/:id
 * @desc    Update an achievement
 * @access  Private
 */
exports.updateAchievement = async (req, res) => {
  try {
    const achievementId = req.params.id;
    const {
      title,
      description,
      category,
      dateAchieved,
      issuer,
      certificateUrl,
      verificationUrl,
      expirationDate,
      visibility,
      featured
    } = req.body;
    
    // Validate achievement ID
    if (!mongoose.Types.ObjectId.isValid(achievementId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid achievement ID'
      });
    }
    
    // Find achievement
    const achievement = await Achievement.findById(achievementId);
    
    if (!achievement) {
      return res.status(404).json({
        success: false,
        error: 'Achievement not found'
      });
    }
    
    // Check ownership
    if (achievement.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this achievement'
      });
    }
    
    // Upload image if provided
    if (req.file) {
      const uploadResult = await fileUploadService.uploadFile(
        req.file,
        'achievements',
        {
          transformation: [
            { width: 800, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        }
      );
      achievement.image = uploadResult.url;
    }
    
    // Update fields
    if (title) achievement.title = title;
    if (description !== undefined) achievement.description = description;
    if (category) achievement.category = category;
    if (dateAchieved) achievement.dateAchieved = new Date(dateAchieved);
    if (issuer !== undefined) achievement.issuer = issuer;
    if (certificateUrl !== undefined) achievement.certificateUrl = certificateUrl;
    if (verificationUrl !== undefined) achievement.verificationUrl = verificationUrl;
    if (expirationDate) achievement.expirationDate = new Date(expirationDate);
    if (visibility) achievement.visibility = visibility;
    if (featured !== undefined) achievement.featured = featured;
    
    achievement.updatedAt = new Date();
    
    await achievement.save();
    
    res.json({
      success: true,
      achievement
    });
  } catch (error) {
    console.error('Update achievement error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating achievement'
    });
  }
};

/**
 * @route   DELETE /api/portfolio/achievements/:id
 * @desc    Delete an achievement
 * @access  Private
 */
exports.deleteAchievement = async (req, res) => {
  try {
    const achievementId = req.params.id;
    
    // Validate achievement ID
    if (!mongoose.Types.ObjectId.isValid(achievementId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid achievement ID'
      });
    }
    
    // Find achievement
    const achievement = await Achievement.findById(achievementId);
    
    if (!achievement) {
      return res.status(404).json({
        success: false,
        error: 'Achievement not found'
      });
    }
    
    // Check ownership
    if (achievement.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this achievement'
      });
    }
    
    // Delete achievement
    await Achievement.findByIdAndDelete(achievementId);
    
    res.json({
      success: true,
      message: 'Achievement deleted successfully'
    });
  } catch (error) {
    console.error('Delete achievement error:', error);
    res.status(500).json({
      success: false,
      error: 'Error deleting achievement'
    });
  }
};

/**
 * @route   POST /api/portfolio/achievements/:id/endorse
 * @desc    Endorse an achievement
 * @access  Private
 */
exports.endorseAchievement = async (req, res) => {
  try {
    const achievementId = req.params.id;
    
    // Validate achievement ID
    if (!mongoose.Types.ObjectId.isValid(achievementId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid achievement ID'
      });
    }
    
    // Find achievement
    const achievement = await Achievement.findById(achievementId);
    
    if (!achievement) {
      return res.status(404).json({
        success: false,
        error: 'Achievement not found'
      });
    }
    
    // Cannot endorse own achievement
    if (achievement.user.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot endorse your own achievement'
      });
    }
    
    // Check if already endorsed
    const alreadyEndorsed = achievement.endorsements.some(
      endorsement => endorsement.user.toString() === req.user.id
    );
    
    if (alreadyEndorsed) {
      // Remove endorsement (toggle)
      achievement.endorsements = achievement.endorsements.filter(
        endorsement => endorsement.user.toString() !== req.user.id
      );
      
      await achievement.save();
      
      return res.json({
        success: true,
        message: 'Endorsement removed',
        endorsementCount: achievement.endorsements.length
      });
    }
    
    // Add endorsement
    achievement.endorsements.push({
      user: req.user.id,
      date: new Date()
    });
    
    await achievement.save();
    
    // Notify user
    const notificationService = require('../services/notification.service');
    const user = await User.findById(req.user.id)
      .select('firstName lastName');
      
    await notificationService.createNotification({
      recipient: achievement.user,
      sender: req.user.id,
      type: 'endorsement',
      contentType: 'achievement',
      contentId: achievement._id,
      text: `${user.firstName} ${user.lastName} endorsed your achievement "${achievement.title}"`,
      actionUrl: `/portfolio/achievements/${achievement._id}`
    });
    
    res.json({
      success: true,
      message: 'Achievement endorsed',
      endorsementCount: achievement.endorsements.length
    });
  } catch (error) {
    console.error('Endorse achievement error:', error);
    res.status(500).json({
      success: false,
      error: 'Error endorsing achievement'
    });
  }
};

/**
 * @route   GET /api/portfolio/streaks
 * @desc    Get user's streaks
 * @access  Private
 */
exports.getUserStreaks = async (req, res) => {
  try {
    const { userId } = req.query;
    
    // If userId provided, get that user's streaks, otherwise get current user's
    const targetUserId = userId || req.user.id;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // If viewing another user's streaks, check permission
    if (targetUserId !== req.user.id) {
      const targetUser = await User.findById(targetUserId);
      
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Check privacy settings
      const streaks = await Streak.find({
        user: targetUserId,
        visibility: 'public'
      })
        .populate('supporters', 'firstName lastName profilePicture')
        .sort({ featured: -1, currentStreak: -1 });
      
      return res.json({
        success: true,
        streaks
      });
    }
    
    // Get own streaks (all visibility levels)
    const streaks = await Streak.find({ user: req.user.id })
      .populate('supporters', 'firstName lastName profilePicture')
      .sort({ featured: -1, currentStreak: -1 });
    
    res.json({
      success: true,
      streaks
    });
  } catch (error) {
    console.error('Get user streaks error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching user streaks'
    });
  }
};

/**
 * @route   POST /api/portfolio/streaks
 * @desc    Create a new streak
 * @access  Private
 */
exports.createStreak = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      target,
      customFrequency,
      activity,
      startDate,
      reminderTime,
      visibility
    } = req.body;
    
    // Validate required fields
    if (!title || !activity) {
      return res.status(400).json({
        success: false,
        error: 'Title and activity are required'
      });
    }
    
    // Parse custom frequency
    let parsedCustomFrequency = null;
    if (target === 'custom' && customFrequency) {
      try {
        parsedCustomFrequency = typeof customFrequency === 'string'
          ? JSON.parse(customFrequency)
          : customFrequency;
      } catch (error) {
        console.error('Error parsing custom frequency:', error);
      }
    }
    
    // Create streak
    const streak = await Streak.create({
      user: req.user.id,
      title,
      description: description || '',
      category: category || '',
      target: target || 'daily',
      customFrequency: parsedCustomFrequency,
      activity,
      startDate: startDate ? new Date(startDate) : new Date(),
      reminderTime: reminderTime ? new Date(reminderTime) : null,
      visibility: visibility || 'public',
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
      checkIns: [],
      createdAt: new Date()
    });
    
    res.status(201).json({
      success: true,
      streak
    });
  } catch (error) {
    console.error('Create streak error:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating streak'
    });
  }
};

/**
 * @route   PUT /api/portfolio/streaks/:id
 * @desc    Update a streak
 * @access  Private
 */
exports.updateStreak = async (req, res) => {
  try {
    const streakId = req.params.id;
    const {
      title,
      description,
      category,
      target,
      customFrequency,
      activity,
      reminderTime,
      visibility
    } = req.body;
    
    // Validate streak ID
    if (!mongoose.Types.ObjectId.isValid(streakId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid streak ID'
      });
    }
    
    // Find streak
    const streak = await Streak.findById(streakId);
    
    if (!streak) {
      return res.status(404).json({
        success: false,
        error: 'Streak not found'
      });
    }
    
    // Check ownership
    if (streak.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this streak'
      });
    }
    
    // Parse custom frequency
    let parsedCustomFrequency = streak.customFrequency;
    if (target === 'custom' && customFrequency) {
      try {
        parsedCustomFrequency = typeof customFrequency === 'string'
          ? JSON.parse(customFrequency)
          : customFrequency;
      } catch (error) {
        console.error('Error parsing custom frequency:', error);
      }
    }
    
    // Update fields
    if (title) streak.title = title;
    if (description !== undefined) streak.description = description;
    if (category) streak.category = category;
    if (target) streak.target = target;
    if (target === 'custom') streak.customFrequency = parsedCustomFrequency;
    if (activity) streak.activity = activity;
    if (reminderTime) streak.reminderTime = new Date(reminderTime);
    if (visibility) streak.visibility = visibility;
    
    streak.updatedAt = new Date();
    
    await streak.save();
    
    res.json({
      success: true,
      streak
    });
  } catch (error) {
    console.error('Update streak error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating streak'
    });
  }
};

/**
 * @route   DELETE /api/portfolio/streaks/:id
 * @desc    Delete a streak
 * @access  Private
 */
exports.deleteStreak = async (req, res) => {
  try {
    const streakId = req.params.id;
    
    // Validate streak ID
    if (!mongoose.Types.ObjectId.isValid(streakId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid streak ID'
      });
    }
    
    // Find streak
    const streak = await Streak.findById(streakId);
    
    if (!streak) {
      return res.status(404).json({
        success: false,
        error: 'Streak not found'
      });
    }
    
    // Check ownership
    if (streak.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this streak'
      });
    }
    
    // Delete streak
    await Streak.findByIdAndDelete(streakId);
    
    res.json({
      success: true,
      message: 'Streak deleted successfully'
    });
  } catch (error) {
    console.error('Delete streak error:', error);
    res.status(500).json({
      success: false,
      error: 'Error deleting streak'
    });
  }
};

/**
 * @route   POST /api/portfolio/streaks/:id/check-in
 * @desc    Check in to a streak
 * @access  Private
 */
exports.checkInToStreak = async (req, res) => {
  try {
    const streakId = req.params.id;
    const { notes, evidence } = req.body;
    
    // Validate streak ID
    if (!mongoose.Types.ObjectId.isValid(streakId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid streak ID'
      });
    }
    
    // Find streak
    const streak = await Streak.findById(streakId);
    
    if (!streak) {
      return res.status(404).json({
        success: false,
        error: 'Streak not found'
      });
    }
    
    // Check ownership
    if (streak.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized for this streak'
      });
    }
    
    // Check if already checked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCheckIn = streak.checkIns && streak.checkIns.find(checkIn => {
      const checkInDate = new Date(checkIn.date);
      checkInDate.setHours(0, 0, 0, 0);
      return checkInDate.getTime() === today.getTime();
    });
    
    if (todayCheckIn) {
      return res.status(400).json({
        success: false,
        error: 'Already checked in today'
      });
    }
    
    // Upload evidence if provided
    let evidenceUrl = evidence;
    if (req.file) {
      const uploadResult = await fileUploadService.uploadFile(
        req.file,
        'streak_evidence',
        {
          resource_type: 'auto'
        }
      );
      evidenceUrl = uploadResult.url;
    }
    
    // Create check-in
    const checkIn = {
      date: new Date(),
      completed: true,
      notes: notes || '',
      evidence: evidenceUrl || ''
    };
    
    // Add to check-ins
    if (!streak.checkIns) {
      streak.checkIns = [];
    }
    
    streak.checkIns.push(checkIn);
    
    // Update streak metrics
    const helper = require('../utils/helpers');
    
    // Calculate current streak
    let currentStreak = 1; // Today's check-in
    let i = streak.checkIns.length - 2; // Start from the previous check-in
    
    // Sort check-ins by date (newest first)
    const sortedCheckIns = [...streak.checkIns].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    // Calculate current streak
    if (sortedCheckIns.length > 1) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const yesterdayCheckIn = sortedCheckIns.find(checkIn => {
        const checkInDate = new Date(checkIn.date);
        checkInDate.setHours(0, 0, 0, 0);
        return checkInDate.getTime() === yesterday.getTime();
      });
      
      if (yesterdayCheckIn) {
        // Consecutive day, increment current streak
        currentStreak = streak.currentStreak + 1;
      } else {
        // Streak broken, reset to 1
        currentStreak = 1;
      }
    }
    
    // Update streak metrics
    streak.currentStreak = currentStreak;
    streak.longestStreak = Math.max(streak.longestStreak || 0, currentStreak);
    streak.totalCompletions = (streak.totalCompletions || 0) + 1;
    
    await streak.save();
    
    res.json({
      success: true,
      message: 'Check-in recorded',
      currentStreak,
      longestStreak: streak.longestStreak,
      totalCompletions: streak.totalCompletions
    });
  } catch (error) {
    console.error('Streak check-in error:', error);
    res.status(500).json({
      success: false,
      error: 'Error checking in to streak'
    });
  }
};

/**
 * @route   POST /api/portfolio/streaks/:id/support
 * @desc    Support a streak
 * @access  Private
 */
exports.supportStreak = async (req, res) => {
  try {
    const streakId = req.params.id;
    
    // Validate streak ID
    if (!mongoose.Types.ObjectId.isValid(streakId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid streak ID'
      });
    }
    
    // Find streak
    const streak = await Streak.findById(streakId);
    
    if (!streak) {
      return res.status(404).json({
        success: false,
        error: 'Streak not found'
      });
    }
    
    // Cannot support own streak
    if (streak.user.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot support your own streak'
      });
    }
    
    // Check if already supporting
    const isSupporting = streak.supporters && streak.supporters.includes(req.user.id);
    
    if (isSupporting) {
      // Remove support (toggle)
      streak.supporters = streak.supporters.filter(id => id.toString() !== req.user.id);
      
      await streak.save();
      
      return res.json({
        success: true,
        message: 'Support removed',
        supportCount: streak.supporters.length
      });
    }
    
    // Add support
    if (!streak.supporters) {
      streak.supporters = [];
    }
    
    streak.supporters.push(req.user.id);
    
    await streak.save();
    
    // Notify streak owner
    const notificationService = require('../services/notification.service');
    const user = await User.findById(req.user.id)
      .select('firstName lastName');
      
    await notificationService.createNotification({
      recipient: streak.user,
      sender: req.user.id,
      type: 'streak_support',
      contentType: 'streak',
      contentId: streak._id,
      text: `${user.firstName} ${user.lastName} is supporting your streak "${streak.title}"`,
      actionUrl: `/portfolio/streaks/${streak._id}`
    });
    
    res.json({
      success: true,
      message: 'Streak supported',
      supportCount: streak.supporters.length
    });
  } catch (error) {
    console.error('Support streak error:', error);
    res.status(500).json({
      success: false,
      error: 'Error supporting streak'
    });
  }
};

/**
 * @route   PUT /api/portfolio/experience
 * @desc    Update work experience
 * @access  Private
 */
exports.updateWorkExperience = async (req, res) => {
  try {
    const { experiences } = req.body;
    
    if (!experiences || !Array.isArray(experiences)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid experiences data'
      });
    }
    
    // Find user
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Initialize portfolio if doesn't exist
    if (!user.portfolio) {
      user.portfolio = {};
    }
    
    // Set work experience
    user.portfolio.workExperience = experiences;
    
    await user.save();
    
    res.json({
      success: true,
      workExperience: user.portfolio.workExperience
    });
  } catch (error) {
    console.error('Update work experience error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating work experience'
    });
  }
};

/**
 * @route   PUT /api/portfolio/education
 * @desc    Update education
 * @access  Private
 */
exports.updateEducation = async (req, res) => {
  try {
    const { education } = req.body;
    
    if (!education || !Array.isArray(education)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid education data'
      });
    }
    
    // Find user
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Initialize portfolio if doesn't exist
    if (!user.portfolio) {
      user.portfolio = {};
    }
    
    // Set education
    user.portfolio.education = education;
    
    await user.save();
    
    res.json({
      success: true,
      education: user.portfolio.education
    });
  } catch (error) {
    console.error('Update education error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating education'
    });
  }
};

/**
 * @route   PUT /api/portfolio/skills
 * @desc    Update skills
 * @access  Private
 */
exports.updateSkills = async (req, res) => {
  try {
    const { skills } = req.body;
    
    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid skills data'
      });
    }
    
    // Find user
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Set skills
    user.skills = skills.map(skill => {
      // If skill is a string, convert to object
      if (typeof skill === 'string') {
        return {
          name: skill,
          endorsements: 0
        };
      }
      
      // If existing skill object, preserve endorsement count
      const existingSkill = user.skills?.find(s => s.name === skill.name);
      
      return {
        name: skill.name,
        endorsements: existingSkill ? existingSkill.endorsements : (skill.endorsements || 0)
      };
    });
    
    await user.save();
    
    res.json({
      success: true,
      skills: user.skills
    });
  } catch (error) {
    console.error('Update skills error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating skills'
    });
  }
};

/**
 * @route   POST /api/portfolio/skills/:skillId/endorse
 * @desc    Endorse a skill
 * @access  Private
 */
exports.endorseSkill = async (req, res) => {
  try {
    const { userId } = req.body;
    const { skillId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Find target user
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Cannot endorse own skills
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot endorse your own skills'
      });
    }
    
    // Find the skill
    if (!targetUser.skills) {
      return res.status(404).json({
        success: false,
        error: 'No skills found'
      });
    }
    
    const skillIndex = targetUser.skills.findIndex(s => s._id.toString() === skillId);
    
    if (skillIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found'
      });
    }
    
    // Check if already endorsed
    const skillEndorsers = targetUser.skillEndorsers || {};
    const endorsers = skillEndorsers[skillId] || [];
    const hasEndorsed = endorsers.includes(req.user.id);
    
    // Initialize if doesn't exist
    if (!targetUser.skillEndorsers) {
      targetUser.skillEndorsers = {};
    }
    
    if (!targetUser.skillEndorsers[skillId]) {
      targetUser.skillEndorsers[skillId] = [];
    }
    
    if (hasEndorsed) {
      // Remove endorsement
      targetUser.skillEndorsers[skillId] = targetUser.skillEndorsers[skillId].filter(
        id => id.toString() !== req.user.id
      );
      
      targetUser.skills[skillIndex].endorsements = Math.max(0, targetUser.skills[skillIndex].endorsements - 1);
      
      await targetUser.save();
      
      return res.json({
        success: true,
        message: 'Endorsement removed',
        endorsements: targetUser.skills[skillIndex].endorsements
      });
    }
    
    // Add endorsement
    targetUser.skillEndorsers[skillId].push(req.user.id);
    targetUser.skills[skillIndex].endorsements = (targetUser.skills[skillIndex].endorsements || 0) + 1;
    
    await targetUser.save();
    
    // Notify user
    const notificationService = require('../services/notification.service');
    const user = await User.findById(req.user.id)
      .select('firstName lastName');
      
    await notificationService.createNotification({
      recipient: userId,
      sender: req.user.id,
      type: 'endorsement',
      contentType: 'skill',
      contentId: skillId,
      text: `${user.firstName} ${user.lastName} endorsed your ${targetUser.skills[skillIndex].name} skill`,
      actionUrl: `/profile/${userId}`
    });
    
    res.json({
      success: true,
      message: 'Skill endorsed',
      endorsements: targetUser.skills[skillIndex].endorsements
    });
  } catch (error) {
    console.error('Endorse skill error:', error);
    res.status(500).json({
      success: false,
      error: 'Error endorsing skill'
    });
  }
};

module.exports = exports;