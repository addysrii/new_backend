const Post = require('../models/content/post.js');
const User = require('../models/user/user.js');
const Hashtag = require('../models/discovery/Hashtag.js');
const Mention = require('../models/social/mention.js');
const Notification = require('../models/social/Notification.js');
const { updateHashtags, createNotification } = require('../utils/helpers.js');

/**
 * @route   POST /api/posts
 * @desc    Create a new post
 * @access  Private
 */
exports.createPost = async (req, res) => {
  try {
    const {
      content,
      type,
      visibility,
      location,
      mentions,
      tags,
      pollData,
      articleData,
      linkUrl,
      captions
    } = req.body;
    
    // Validate content requirement
    if (!content && !req.files?.length && !linkUrl && !pollData && !articleData) {
      return res.status(400).json({ 
        success: false,
        error: 'Post must have content, media, link, poll, or article data'
      });
    }
    
    // Determine post type based on provided data
    let postType = type || 'text';
    if (!type) {
      if (req.files?.length > 0) {
        postType = req.files[0].mimetype.startsWith('image/') ? 'image' : 'video';
      } else if (linkUrl) {
        postType = 'link';
      } else if (pollData) {
        postType = 'poll';
      } else if (articleData) {
        postType = 'article';
      }
    }
    
    // Process location data
    let locationData = null;
    if (location) {
      try {
        locationData = typeof location === 'string' ? JSON.parse(location) : location;
      } catch (error) {
        console.error('Error parsing location data:', error);
      }
    }
    
    // Process mentions data
    let mentionsData = [];
    if (mentions) {
      try {
        mentionsData = typeof mentions === 'string' ? JSON.parse(mentions) : mentions;
      } catch (error) {
        console.error('Error parsing mentions data:', error);
      }
    }
    
    // Process tags/hashtags
    let parsedTags = [];
    if (tags) {
      parsedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
    }
    
    // Extract hashtags from content
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const hashtagMatches = content ? [...content.matchAll(hashtagRegex)] : [];
    const contentHashtags = hashtagMatches.map(match => match[1].toLowerCase());
    
    // Combine explicit tags and content hashtags
    const allTags = [...new Set([...parsedTags, ...contentHashtags])];
    
    // Process media files and captions
    let images = [];
    let videos = [];
    
    if (req.files && req.files.length > 0) {
      let parsedCaptions = {};
      
      if (captions) {
        try {
          parsedCaptions = typeof captions === 'string' ? JSON.parse(captions) : captions;
        } catch (error) {
          console.error('Error parsing captions:', error);
        }
      }
      
      req.files.forEach((file, index) => {
        if (file.mimetype.startsWith('image/')) {
          images.push({
            url: file.path,
            caption: parsedCaptions[index] || '',
            altText: parsedCaptions[index] || '',
            order: index
          });
        } else if (file.mimetype.startsWith('video/')) {
          videos.push({
            url: file.path,
            thumbnail: '', // Cloudinary can generate this automatically
            caption: parsedCaptions[index] || '',
            duration: 0 // To be determined later
          });
        }
      });
    }
    
    // Process link preview if URL provided
    let linkPreviewData = null;
    if (linkUrl) {
      // In a real app, you would use a service like OpenGraph to fetch metadata
      linkPreviewData = {
        url: linkUrl,
        title: '',
        description: '',
        imageUrl: ''
      };
    }
    
    // Process poll data
    let processedPollData = null;
    if (pollData) {
      try {
        const parsed = typeof pollData === 'string' ? JSON.parse(pollData) : pollData;
        
        if (!parsed.question || !parsed.options || !Array.isArray(parsed.options) || parsed.options.length < 2) {
          return res.status(400).json({ 
            success: false,
            error: 'Poll must have a question and at least 2 options'
          });
        }
        
        processedPollData = {
          question: parsed.question,
          options: parsed.options.map(option => ({
            text: option,
            votes: []
          })),
          expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 1 week
          allowMultipleVotes: parsed.allowMultipleVotes || false
        };
      } catch (error) {
        console.error('Error parsing poll data:', error);
        return res.status(400).json({ 
          success: false,
          error: 'Invalid poll data format'
        });
      }
    }
    
    // Process article data
    let processedArticleData = null;
    if (articleData) {
      try {
        processedArticleData = typeof articleData === 'string' ? JSON.parse(articleData) : articleData;
      } catch (error) {
        console.error('Error parsing article data:', error);
      }
    }
    
    // Create the post
    const post = await Post.create({
      author: req.user.id,
      content: content || '',
      type: postType,
      images,
      videos,
      visibility: visibility || 'public',
      location: locationData,
      mentions: mentionsData,
      hashtags: contentHashtags,
      linkPreview: linkPreviewData,
      pollData: processedPollData,
      articleData: processedArticleData,
      tags: allTags
    });
    
    // Process hashtags to update global hashtag counts
    if (allTags.length > 0) {
      await updateHashtags(allTags, 'post');
    }
    
    // Process mentions to create notifications and mention records
    if (mentionsData.length > 0) {
      const user = await User.findById(req.user.id)
        .select('firstName lastName');
      
      for (const mention of mentionsData) {
        // Create notification
        await createNotification({
          recipient: mention.user,
          sender: req.user.id,
          type: 'mention',
          contentType: 'post',
          contentId: post._id,
          text: `${user.firstName} ${user.lastName} mentioned you in a post`,
          actionUrl: `/posts/${post._id}`
        });
        
        // Create mention record
        await Mention.create({
          user: mention.user,
          mentionedBy: req.user.id,
          contentType: 'post',
          contentId: post._id
        });
      }
    }
    
    // Populate the post for response
    const populatedPost = await Post.findById(post._id)
      .populate('author', 'firstName lastName profilePicture headline')
      .populate('mentions.user', 'firstName lastName profilePicture')
      .populate('likes.user', 'firstName lastName profilePicture');
    
    res.status(201).json({
      success: true,
      post: populatedPost
    });
  } catch (error) {
    console.error('Create post error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false,
        error: 'File size exceeded. Maximum file size is 100MB.'
      });
    }
    
    if (error.message && error.message.includes('Invalid file type')) {
      return res.status(400).json({ 
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Error creating post'
    });
  }
};

/**
 * @route   GET /api/posts
 * @desc    Get posts with pagination
 * @access  Private
 */
exports.getPosts = async (req, res) => {
  try {
    const { limit = 10, before, after, userId, type } = req.query;
    
    // Build query
    let query = {};
    
    // Filter by date range
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    if (after) {
      query.createdAt = { $gt: new Date(after) };
    }
    
    // Filter by user if provided
    if (userId) {
      query.author = userId;
    }
    
    // Filter by post type if provided
    if (type) {
      query.type = type;
    }
    
    // Apply privacy filter
    const user = await User.findById(req.user.id);
    query.$or = [
      { visibility: 'public' },
      { visibility: 'connections', author: { $in: user.connections || [] } },
      { author: req.user.id }
    ];
    
    // Execute query with sorting and pagination
    const posts = await Post.find(query)
      .populate('author', 'firstName lastName profilePicture headline')
      .populate('mentions.user', 'firstName lastName profilePicture')
      .populate({
        path: 'comments',
        options: { limit: 2, sort: { createdAt: -1 } },
        populate: {
          path: 'author',
          select: 'firstName lastName profilePicture'
        }
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Get total count
    const total = await Post.countDocuments(query);
    
    // Check if user has liked or bookmarked posts
    const enhancedPosts = posts.map(post => {
      const postObj = post.toObject();
      
      // Check if user has liked this post
      const userLike = post.likes.find(like => like.user.toString() === req.user.id);
      postObj.userReaction = userLike ? userLike.reaction : null;
      
      // Check if user has bookmarked this post
      postObj.isBookmarked = post.bookmarks?.includes(req.user.id) || false;
      
      return postObj;
    });
    
    res.json({
      success: true,
      posts: enhancedPosts,
      hasMore: posts.length === parseInt(limit),
      total
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching posts'
    });
  }
};

/**
 * @route   GET /api/posts/:id
 * @desc    Get a single post by ID
 * @access  Private
 */
exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'firstName lastName profilePicture headline')
      .populate('mentions.user', 'firstName lastName profilePicture')
      .populate({
        path: 'comments',
        populate: {
          path: 'author',
          select: 'firstName lastName profilePicture'
        }
      });
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        error: 'Post not found'
      });
    }
    
    // Check visibility permissions
    if (post.visibility !== 'public' && 
        post.author._id.toString() !== req.user.id && 
        post.visibility === 'connections' && 
        !post.author.connections?.includes(req.user.id)) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to view this post'
      });
    }
    
    // Increment impressions
    await Post.findByIdAndUpdate(req.params.id, {
      $inc: { impressions: 1 }
    });
    
    // Check if user has liked or bookmarked this post
    const postObj = post.toObject();
    
    // Check if user has liked this post
    const userLike = post.likes.find(like => like.user.toString() === req.user.id);
    postObj.userReaction = userLike ? userLike.reaction : null;
    
    // Check if user has bookmarked this post
    postObj.isBookmarked = post.bookmarks?.includes(req.user.id) || false;
    
    res.json({
      success: true,
      post: postObj
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching post'
    });
  }
};

/**
 * @route   PUT /api/posts/:id
 * @desc    Update a post
 * @access  Private
 */
exports.updatePost = async (req, res) => {
  try {
    const { content, visibility, tags } = req.body;
    
    // Find post
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        error: 'Post not found'
      });
    }
    
    // Check ownership
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to update this post'
      });
    }
    
    // Save previous content for edit history
    if (content && content !== post.content) {
      if (!post.editHistory) {
        post.editHistory = [];
      }
      
      post.editHistory.push({
        content: post.content,
        editedAt: new Date()
      });
      
      post.isEdited = true;
    }
    
    // Update fields if provided
    if (content) post.content = content;
    if (visibility) post.visibility = visibility;
    
    // Process tags if provided
    if (tags) {
      const oldTags = post.tags || [];
      const newTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
      
      post.tags = newTags;
      
      // Update hashtag counts
      await updateHashtags(newTags, 'post', oldTags);
    }
    
    // Extract hashtags from updated content
    if (content) {
      const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
      const hashtagMatches = content ? [...content.matchAll(hashtagRegex)] : [];
      const contentHashtags = hashtagMatches.map(match => match[1].toLowerCase());
      
      post.hashtags = contentHashtags;
    }
    
    post.lastUpdated = new Date();
    await post.save();
    
    // Return updated post
    const updatedPost = await Post.findById(post._id)
      .populate('author', 'firstName lastName profilePicture headline')
      .populate('mentions.user', 'firstName lastName profilePicture')
      .populate({
        path: 'comments',
        options: { limit: 2, sort: { createdAt: -1 } },
        populate: {
          path: 'author',
          select: 'firstName lastName profilePicture'
        }
      });
    
    res.json({
      success: true,
      post: updatedPost
    });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error updating post'
    });
  }
};

/**
 * @route   DELETE /api/posts/:id
 * @desc    Delete a post
 * @access  Private
 */
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        error: 'Post not found'
      });
    }
    
    // Check ownership
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to delete this post'
      });
    }
    
    // Soft delete (set deletedAt timestamp)
    post.deletedAt = new Date();
    await post.save();
    
    // Update hashtag counts
    if (post.tags && post.tags.length > 0) {
      await updateHashtags([], 'post', post.tags);
    }
    
    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error deleting post'
    });
  }
};

/**
 * @route   POST /api/posts/:id/react
 * @desc    React to a post (like, love, etc.)
 * @access  Private
 */
exports.reactToPost = async (req, res) => {
  try {
    const { reaction } = req.body;
    
    if (!reaction || !['like', 'love', 'celebrate', 'support', 'insightful', 'curious'].includes(reaction)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid reaction type'
      });
    }
    
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ 
        success: false,
        error: 'Post not found'
      });
    }
    
    // Check if user already reacted
    const existingLike = post.likes.find(like => like.user.toString() === req.user.id);
    
    if (existingLike) {
      if (existingLike.reaction === reaction) {
        // Remove reaction if same type (toggle)
        post.likes = post.likes.filter(like => like.user.toString() !== req.user.id);
        
        await post.save();
        
        // Count reactions by type
        const reactionCounts = {};
        post.likes.forEach(like => {
          if (!reactionCounts[like.reaction]) {
            reactionCounts[like.reaction] = 0;
          }
          reactionCounts[like.reaction]++;
        });
        
        return res.json({
          success: true,
          reactionCounts,
          totalLikes: post.likes.length,
          userReaction: null
        });
      } else {
        // Update reaction type
        existingLike.reaction = reaction;
        existingLike.createdAt = new Date();
      }
    } else {
      // Add new reaction
      post.likes.push({
        user: req.user.id,
        reaction,
        createdAt: new Date()
      });
      
      // Notify post author if it's not their own post
      if (post.author.toString() !== req.user.id) {
        const user = await User.findById(req.user.id)
          .select('firstName lastName');
        
        await createNotification({
          recipient: post.author,
          sender: req.user.id,
          type: 'like',
          contentType: 'post',
          contentId: post._id,
          text: `${user.firstName} ${user.lastName} reacted to your post with ${reaction}`,
          actionUrl: `/posts/${post._id}`
        });
        
        // Update analytics
        await User.findByIdAndUpdate(post.author, {
          $inc: { 'analytics.contentEngagement.likes': 1 }
        });
      }
    }
    
    await post.save();
    
    // Count reactions by type
    const reactionCounts = {};
    post.likes.forEach(like => {
      if (!reactionCounts[like.reaction]) {
        reactionCounts[like.reaction] = 0;
      }
      reactionCounts[like.reaction]++;
    });
    
    // Get user's current reaction
    const userReaction = post.likes.find(like => like.user.toString() === req.user.id)?.reaction || null;
    
    res.json({
      success: true,
      reactionCounts,
      totalLikes: post.likes.length,
      userReaction
    });
  } catch (error) {
    console.error('Post reaction error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error updating post reaction'
    });
  }
};

/**
 * @route   POST /api/posts/:id/bookmark
 * @desc    Bookmark a post
 * @access  Private
 */
exports.bookmarkPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        error: 'Post not found'
      });
    }
    
    // Check if post is already bookmarked
    const isBookmarked = post.bookmarks && post.bookmarks.includes(req.user.id);
    
    if (isBookmarked) {
      // Remove bookmark
      post.bookmarks = post.bookmarks.filter(id => id.toString() !== req.user.id);
    } else {
      // Add bookmark
      if (!post.bookmarks) {
        post.bookmarks = [];
      }
      post.bookmarks.push(req.user.id);
    }
    
    await post.save();
    
    res.json({
      success: true,
      isBookmarked: !isBookmarked,
      bookmarkCount: post.bookmarks.length
    });
  } catch (error) {
    console.error('Bookmark post error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error bookmarking post'
    });
  }
};

/**
 * @route   POST /api/posts/:id/comments
 * @desc    Add a comment to a post
 * @access  Private
 */
exports.addComment = async (req, res) => {
  try {
    const { content, parentCommentId, mentions } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false,
        error: 'Comment content is required'
      });
    }
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        error: 'Post not found'
      });
    }
    
    // Process mentions if provided
    let mentionsData = [];
    if (mentions) {
      try {
        mentionsData = typeof mentions === 'string' ? JSON.parse(mentions) : mentions;
      } catch (error) {
        console.error('Error parsing mentions data:', error);
      }
    }
    
    // Create new comment object
    const newComment = {
      author: req.user.id,
      content,
      mentions: mentionsData,
      createdAt: new Date()
    };
    
    // Add parent comment reference if it's a reply
    if (parentCommentId) {
      newComment.parentComment = parentCommentId;
    }
    
    // Add comment to post
    post.comments.push(newComment);
    await post.save();
    
    // Get the new comment with author populated
    const populatedPost = await Post.findById(post._id)
      .populate('author', 'firstName lastName profilePicture')
      .populate({
        path: 'comments',
        populate: {
          path: 'author',
          select: 'firstName lastName profilePicture'
        }
      });
    
    const addedComment = populatedPost.comments[populatedPost.comments.length - 1];
    
    // Notify post author of the comment (if not self)
    if (post.author.toString() !== req.user.id) {
      const user = await User.findById(req.user.id);
      
      await createNotification({
        recipient: post.author,
        sender: req.user.id,
        type: 'comment',
        contentType: 'post',
        contentId: post._id,
        text: `${user.firstName} ${user.lastName} commented on your post`,
        actionUrl: `/posts/${post._id}`
      });
      
      // Update analytics
      await User.findByIdAndUpdate(post.author, {
        $inc: { 'analytics.contentEngagement.comments': 1 }
      });
    }
    
    // Also notify parent comment author if this is a reply
    if (parentCommentId) {
      const parentComment = post.comments.find(c => c._id.toString() === parentCommentId);
      
      if (parentComment && parentComment.author.toString() !== req.user.id) {
        const user = await User.findById(req.user.id);
        
        await createNotification({
          recipient: parentComment.author,
          sender: req.user.id,
          type: 'reply',
          contentType: 'comment',
          contentId: parentComment._id,
          text: `${user.firstName} ${user.lastName} replied to your comment`,
          actionUrl: `/posts/${post._id}`
        });
      }
    }
    
    // Process mentions to create notifications
    if (mentionsData.length > 0) {
      const user = await User.findById(req.user.id);
      
      for (const mention of mentionsData) {
        // Skip notification if mentioned user is same as comment author
        if (mention.user.toString() === req.user.id) continue;
        
        await createNotification({
          recipient: mention.user,
          sender: req.user.id,
          type: 'mention',
          contentType: 'comment',
          contentId: addedComment._id,
          text: `${user.firstName} ${user.lastName} mentioned you in a comment`,
          actionUrl: `/posts/${post._id}`
        });
      }
    }
    
    res.json({
      success: true,
      comment: addedComment
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error adding comment'
    });
  }
};

/**
 * @route   DELETE /api/posts/:id/comments/:commentId
 * @desc    Delete a comment
 * @access  Private
 */
exports.deleteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    
    const post = await Post.findById(id);
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        error: 'Post not found'
      });
    }
    
    // Find the comment
    const comment = post.comments.find(c => c._id.toString() === commentId);
    
    if (!comment) {
      return res.status(404).json({ 
        success: false,
        error: 'Comment not found'
      });
    }
    
    // Check ownership
    if (comment.author.toString() !== req.user.id && post.author.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to delete this comment'
      });
    }
    
    // Remove comment
    post.comments = post.comments.filter(c => c._id.toString() !== commentId);
    
    await post.save();
    
    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error deleting comment'
    });
  }
};

/**
 * @route   GET /api/posts/trending
 * @desc    Get trending posts
 * @access  Private
 */
exports.getTrendingPosts = async (req, res) => {
  try {
    const { days = 7, limit = 10 } = req.query;
    
    const trendingPosts = await Post.findTrending(parseInt(days), parseInt(limit));
    
    res.json({
      success: true,
      posts: trendingPosts
    });
  } catch (error) {
    console.error('Get trending posts error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching trending posts'
    });
  }
};

module.exports = exports;