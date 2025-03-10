// controllers/story.controller.js
const Story = require('../models/content/Story');
const Highlight = require('../models/content/Highlight');
const User = require('../models/user/user.js');
const fileUploadService = require('../services/file-upload.service');
const notificationService = require('../services/notification.service');
const mongoose = require('mongoose');

/**
 * @route   POST /api/stories
 * @desc    Create a new story
 * @access  Private
 */
exports.createStory = async (req, res) => {
  try {
    const { content, location, mentions, backgroundStyle, privacy, stickers, linkUrl } = req.body;
    
    // Check for media file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Media file is required for story'
      });
    }
    
    // Determine media type from mimetype
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    
    // Upload media to cloud storage
    const uploadResult = await fileUploadService.uploadFile(
      req.file,
      'stories',
      {
        transformation: mediaType === 'image' 
          ? [{ width: 1080, crop: 'limit' }, { quality: 'auto:good' }]
          : [{ quality: 'auto:good' }]
      }
    );
    
    // Parse location data
    let locationData = null;
    if (location) {
      try {
        locationData = typeof location === 'string' ? JSON.parse(location) : location;
      } catch (error) {
        console.error('Error parsing location data:', error);
      }
    }
    
    // Parse mentions data
    let mentionsData = [];
    if (mentions) {
      try {
        mentionsData = typeof mentions === 'string' ? JSON.parse(mentions) : mentions;
      } catch (error) {
        console.error('Error parsing mentions data:', error);
      }
    }
    
    // Parse background style data
    let backgroundStyleData = null;
    if (backgroundStyle) {
      try {
        backgroundStyleData = typeof backgroundStyle === 'string' ? JSON.parse(backgroundStyle) : backgroundStyle;
      } catch (error) {
        console.error('Error parsing background style data:', error);
      }
    }
    
    // Parse stickers data
    let stickersData = [];
    if (stickers) {
      try {
        stickersData = typeof stickers === 'string' ? JSON.parse(stickers) : stickers;
      } catch (error) {
        console.error('Error parsing stickers data:', error);
      }
    }
    
    // Create story
    const story = await Story.create({
      author: req.user.id,
      content: content || '',
      mediaUrl: uploadResult.url,
      mediaType,
      location: locationData,
      backgroundStyle: backgroundStyleData,
      mentions: mentionsData,
      stickers: stickersData,
      linkUrl,
      privacy: privacy || 'public',
      createdAt: new Date()
    });
    
    // Notify mentioned users
    if (mentionsData.length > 0) {
      const user = await User.findById(req.user.id)
        .select('firstName lastName');
      
      for (const mention of mentionsData) {
        // Create notification
        await notificationService.createNotification({
          recipient: mention.user,
          sender: req.user.id,
          type: 'mention',
          contentType: 'story',
          contentId: story._id,
          text: `${user.firstName} ${user.lastName} mentioned you in a story`,
          actionUrl: `/stories/${story._id}`
        });
      }
    }
    
    // Populate author data
    await story.populate('author', 'firstName lastName profilePicture');
    
    res.status(201).json({
      success: true,
      story
    });
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating story'
    });
  }
};

/**
 * @route   GET /api/stories
 * @desc    Get stories feed
 * @access  Private
 */
exports.getStories = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('following connections');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Combine following and connections for story feed
    const followingIds = user.following || [];
    const connectionIds = user.connections || [];
    
    const userIds = [
      ...new Set([
        ...followingIds.map(id => id.toString()),
        ...connectionIds.map(id => id.toString()),
        req.user.id
      ])
    ];
    
    // Get active stories (not expired)
    // Stories expire after 24 hours (handled by TTL index in model)
    const stories = await Story.find({
      author: { $in: userIds },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
      .populate('author', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 });
    
    // Group stories by author
    const storiesMap = {};
    
    stories.forEach(story => {
      const authorId = story.author._id.toString();
      
      if (!storiesMap[authorId]) {
        storiesMap[authorId] = {
          user: {
            _id: story.author._id,
            firstName: story.author.firstName,
            lastName: story.author.lastName,
            profilePicture: story.author.profilePicture
          },
          stories: []
        };
      }
      
      // Check if user has viewed this story
      const hasViewed = story.viewers?.some(v => v.user.toString() === req.user.id);
      
      storiesMap[authorId].stories.push({
        ...story.toObject(),
        hasViewed
      });
    });
    
    // Convert map to array
    const storyFeed = Object.values(storiesMap);
    
    // Sort by latest story and whether stories have been viewed
    storyFeed.sort((a, b) => {
      // Check if any stories are unviewed
      const aHasUnviewed = a.stories.some(s => !s.hasViewed);
      const bHasUnviewed = b.stories.some(s => !s.hasViewed);
      
      // Show users with unviewed stories first
      if (aHasUnviewed && !bHasUnviewed) return -1;
      if (!aHasUnviewed && bHasUnviewed) return 1;
      
      // Otherwise sort by latest story
      const aLatest = Math.max(...a.stories.map(s => new Date(s.createdAt).getTime()));
      const bLatest = Math.max(...b.stories.map(s => new Date(s.createdAt).getTime()));
      
      return bLatest - aLatest;
    });
    
    res.json({
      success: true,
      stories: storyFeed
    });
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching stories'
    });
  }
};

/**
 * @route   GET /api/stories/:id
 * @desc    Get story by ID
 * @access  Private
 */
exports.getStoryById = async (req, res) => {
  try {
    const storyId = req.params.id;
    
    // Validate story ID
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid story ID'
      });
    }
    
    // Find story
    const story = await Story.findById(storyId)
      .populate('author', 'firstName lastName profilePicture')
      .populate('mentions.user', 'firstName lastName profilePicture')
      .populate('viewers.user', 'firstName lastName profilePicture')
      .populate('reactions.user', 'firstName lastName profilePicture')
      .populate('replies.user', 'firstName lastName profilePicture');
    
    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'Story not found'
      });
    }
    
    // Check privacy settings
    if (story.author._id.toString() !== req.user.id) {
      const user = await User.findById(req.user.id);
      
      if (story.privacy === 'close-friends') {
        // Check if user is in close friends
        const author = await User.findById(story.author._id);
        if (!author.closeFriends || !author.closeFriends.includes(req.user.id)) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to view this story'
          });
        }
      } else if (story.privacy === 'connections') {
        // Check if user is connected
        if (!user.connections || !user.connections.includes(story.author._id.toString())) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to view this story'
          });
        }
      } else if (story.privacy === 'followers') {
        // Check if user is a follower
        const author = await User.findById(story.author._id);
        if (!author.followers || !author.followers.includes(req.user.id)) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to view this story'
          });
        }
      }
    }
    
    // Check if story is already viewed by user
    const isViewed = story.viewers && story.viewers.some(v => v.user._id.toString() === req.user.id);
    
    // Add to viewers if not already viewed
    if (!isViewed) {
      story.viewers.push({
        user: req.user.id,
        viewedAt: new Date()
      });
      
      await story.save();
    }
    
    res.json({
      success: true,
      story
    });
  } catch (error) {
    console.error('Get story error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching story'
    });
  }
};

/**
 * @route   POST /api/stories/:id/view
 * @desc    Mark story as viewed
 * @access  Private
 */
exports.viewStory = async (req, res) => {
  try {
    const storyId = req.params.id;
    
    // Validate story ID
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid story ID'
      });
    }
    
    // Find story
    const story = await Story.findById(storyId);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'Story not found'
      });
    }
    
    // Check if already viewed
    const isViewed = story.viewers && story.viewers.some(v => v.user.toString() === req.user.id);
    
    if (isViewed) {
      return res.json({
        success: true,
        message: 'Story already viewed'
      });
    }
    
    // Add to viewers
    story.viewers.push({
      user: req.user.id,
      viewedAt: new Date()
    });
    
    await story.save();
    
    res.json({
      success: true,
      message: 'Story marked as viewed'
    });
  } catch (error) {
    console.error('View story error:', error);
    res.status(500).json({
      success: false,
      error: 'Error marking story as viewed'
    });
  }
};

/**
 * @route   POST /api/stories/:id/react
 * @desc    React to a story
 * @access  Private
 */
exports.reactToStory = async (req, res) => {
  try {
    const storyId = req.params.id;
    const { reaction } = req.body;
    
    // Validate story ID
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid story ID'
      });
    }
    
    // Validate reaction
    if (!reaction || !['heart', 'laugh', 'wow', 'sad', 'angry', 'fire', 'clap', 'question'].includes(reaction)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reaction'
      });
    }
    
    // Find story
    const story = await Story.findById(storyId);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'Story not found'
      });
    }
    
    // Check if already reacted
    const existingReaction = story.reactions && 
      story.reactions.findIndex(r => r.user.toString() === req.user.id);
    
    if (existingReaction !== -1) {
      // Update existing reaction
      story.reactions[existingReaction].reaction = reaction;
      story.reactions[existingReaction].createdAt = new Date();
    } else {
      // Add new reaction
      if (!story.reactions) {
        story.reactions = [];
      }
      
      story.reactions.push({
        user: req.user.id,
        reaction,
        createdAt: new Date()
      });
      
      // Notify story author if not self
      if (story.author.toString() !== req.user.id) {
        const user = await User.findById(req.user.id)
          .select('firstName lastName');
        
        await notificationService.createNotification({
          recipient: story.author,
          sender: req.user.id,
          type: 'reaction',
          contentType: 'story',
          contentId: story._id,
          text: `${user.firstName} ${user.lastName} reacted to your story with ${reaction}`,
          actionUrl: `/stories/${story._id}`
        });
      }
    }
    
    await story.save();
    
    res.json({
      success: true,
      message: 'Reaction added',
      reaction
    });
  } catch (error) {
    console.error('React to story error:', error);
    res.status(500).json({
      success: false,
      error: 'Error reacting to story'
    });
  }
};

/**
 * @route   POST /api/stories/:id/reply
 * @desc    Reply to a story
 * @access  Private
 */
exports.replyToStory = async (req, res) => {
  try {
    const storyId = req.params.id;
    const { message } = req.body;
    
    // Validate story ID
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid story ID'
      });
    }
    
    // Validate message
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    // Find story
    const story = await Story.findById(storyId);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'Story not found'
      });
    }
    
    // Add reply
    if (!story.replies) {
      story.replies = [];
    }
    
    story.replies.push({
      user: req.user.id,
      message,
      createdAt: new Date()
    });
    
    await story.save();
    
    // Notify story author if not self
    if (story.author.toString() !== req.user.id) {
      const user = await User.findById(req.user.id)
        .select('firstName lastName');
      
      await notificationService.createNotification({
        recipient: story.author,
        sender: req.user.id,
        type: 'reply',
        contentType: 'story',
        contentId: story._id,
        text: `${user.firstName} ${user.lastName} replied to your story`,
        actionUrl: `/stories/${story._id}`
      });
    }
    
    res.json({
      success: true,
      message: 'Reply added'
    });
  } catch (error) {
    console.error('Reply to story error:', error);
    res.status(500).json({
      success: false,
      error: 'Error replying to story'
    });
  }
};

/**
 * @route   POST /api/stories/highlights
 * @desc    Create highlight from stories
 * @access  Private
 */
exports.createHighlight = async (req, res) => {
  try {
    const { title, storyIds } = req.body;
    
    // Validate input
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }
    
    if (!storyIds || !Array.isArray(storyIds) || storyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one story ID is required'
      });
    }
    
    // Validate story IDs
    const validStoryIds = storyIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validStoryIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid story IDs provided'
      });
    }
    
    // Get stories that belong to user
    const stories = await Story.find({
      _id: { $in: validStoryIds },
      author: req.user.id
    });
    
    if (stories.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid stories found'
      });
    }
    
    // Create highlight
    const highlight = await Highlight.create({
      author: req.user.id,
      title,
      stories: stories.map(story => ({
        content: story.content,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        createdAt: story.createdAt
      })),
      createdAt: new Date()
    });
    
    res.status(201).json({
      success: true,
      highlight
    });
  } catch (error) {
    console.error('Create highlight error:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating highlight'
    });
  }
};

/**
 * @route   GET /api/stories/highlights/:userId
 * @desc    Get user's highlights
 * @access  Private
 */
exports.getUserHighlights = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Get highlights
    const highlights = await Highlight.find({ author: userId })
      .populate('author', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      highlights
    });
  } catch (error) {
    console.error('Get user highlights error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching user highlights'
    });
  }
};

/**
 * @route   GET /api/stories/highlights/:id
 * @desc    Get highlight by ID
 * @access  Private
 */
exports.getHighlightById = async (req, res) => {
  try {
    const highlightId = req.params.id;
    
    // Validate highlight ID
    if (!mongoose.Types.ObjectId.isValid(highlightId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid highlight ID'
      });
    }
    
    // Find highlight
    const highlight = await Highlight.findById(highlightId)
      .populate('author', 'firstName lastName profilePicture');
    
    if (!highlight) {
      return res.status(404).json({
        success: false,
        error: 'Highlight not found'
      });
    }
    
    res.json({
      success: true,
      highlight
    });
  } catch (error) {
    console.error('Get highlight error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching highlight'
    });
  }
};

/**
 * @route   PUT /api/stories/highlights/:id
 * @desc    Update highlight
 * @access  Private
 */
exports.updateHighlight = async (req, res) => {
  try {
    const highlightId = req.params.id;
    const { title, storyIds } = req.body;
    
    // Validate highlight ID
    if (!mongoose.Types.ObjectId.isValid(highlightId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid highlight ID'
      });
    }
    
    // Find highlight
    const highlight = await Highlight.findById(highlightId);
    
    if (!highlight) {
      return res.status(404).json({
        success: false,
        error: 'Highlight not found'
      });
    }
    
    // Check ownership
    if (highlight.author.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this highlight'
      });
    }
    
    // Update title if provided
    if (title) {
      highlight.title = title;
    }
    
    // Update stories if provided
    if (storyIds && Array.isArray(storyIds) && storyIds.length > 0) {
      const validStoryIds = storyIds.filter(id => mongoose.Types.ObjectId.isValid(id));
      
      if (validStoryIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid story IDs provided'
        });
      }
      
      // Get stories that belong to user
      const stories = await Story.find({
        _id: { $in: validStoryIds },
        author: req.user.id
      });
      
      if (stories.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No valid stories found'
        });
      }
      
      // Replace stories
      highlight.stories = stories.map(story => ({
        content: story.content,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        createdAt: story.createdAt
      }));
    }
    
    await highlight.save();
    
    res.json({
      success: true,
      highlight
    });
  } catch (error) {
    console.error('Update highlight error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating highlight'
    });
  }
};

/**
 * @route   DELETE /api/stories/highlights/:id
 * @desc    Delete highlight
 * @access  Private
 */
exports.deleteHighlight = async (req, res) => {
  try {
    const highlightId = req.params.id;
    
    // Validate highlight ID
    if (!mongoose.Types.ObjectId.isValid(highlightId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid highlight ID'
      });
    }
    
    // Find highlight
    const highlight = await Highlight.findById(highlightId);
    
    if (!highlight) {
      return res.status(404).json({
        success: false,
        error: 'Highlight not found'
      });
    }
    
    // Check ownership
    if (highlight.author.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this highlight'
      });
    }
    
    // Delete highlight
    await Highlight.findByIdAndDelete(highlightId);
    
    res.json({
      success: true,
      message: 'Highlight deleted successfully'
    });
  } catch (error) {
    console.error('Delete highlight error:', error);
    res.status(500).json({
      success: false,
      error: 'Error deleting highlight'
    });
  }
};

/**
 * @route   GET /api/stories/user/:userId
 * @desc    Get user's active stories
 * @access  Private
 */
exports.getUserStories = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if current user has permission to view stories
    if (userId !== req.user.id) {
      // Check privacy settings
      const privacySetting = user.privacy?.storyVisibility || 'followers';
      
      if (privacySetting === 'connections') {
        const currentUser = await User.findById(req.user.id);
        if (!currentUser.connections || !currentUser.connections.includes(userId)) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to view this user\'s stories'
          });
        }
      } else if (privacySetting === 'followers') {
        if (!user.followers || !user.followers.includes(req.user.id)) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to view this user\'s stories'
          });
        }
      } else if (privacySetting === 'close-friends') {
        if (!user.closeFriends || !user.closeFriends.includes(req.user.id)) {
          return res.status(403).json({
            success: false,
            error: 'Not authorized to view this user\'s stories'
          });
        }
      }
    }
    
    // Get active stories
    const stories = await Story.find({
      author: userId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
      .populate('author', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 });
    
    // Add viewed status
    const storiesWithViewStatus = stories.map(story => {
      const storyObj = story.toObject();
      storyObj.hasViewed = story.viewers?.some(v => v.user.toString() === req.user.id) || false;
      return storyObj;
    });
    
    res.json({
      success: true,
      stories: storiesWithViewStatus
    });
  } catch (error) {
    console.error('Get user stories error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching user stories'
    });
  }
};

module.exports = exports;