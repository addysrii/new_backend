// controllers/event.controller.js
const Event = require('../models/discovery/event.js');
const User = require('../models/user/user.js');
const fileUploadService = require('../services/file-upload.service');
const notificationService = require('../services/notification.service');
const { updateHashtags } = require('../utils/helpers');
const mongoose = require('mongoose');

/**
 * @route   POST /api/events
 * @desc    Create a new event
 * @access  Private
 */
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      eventType,
      category,
      tags,
      startDate,
      endDate,
      location,
      privacy,
      isRecurring,
      recurrencePattern,
      recurrenceSettings
    } = req.body;
    
    // Validate required fields
    if (!title || !description || !eventType || !category || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }
    
    if (end <= start) {
      return res.status(400).json({
        success: false,
        error: 'End date must be after start date'
      });
    }
    
    // Process cover image if uploaded
    let coverImage = null;
    if (req.file) {
      const uploadResult = await fileUploadService.uploadFile(
        req.file,
        'event_covers',
        {
          transformation: [
            { width: 1200, height: 630, crop: 'fill' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        }
      );
      coverImage = uploadResult.url;
    }
    
    // Process tags
    let parsedTags = [];
    if (tags) {
      parsedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
    }
    
    // Process location
    let locationData = {};
    if (eventType === 'virtual' || eventType === 'hybrid') {
      locationData.virtual = {
        platform: location?.virtual?.platform || '',
        link: location?.virtual?.link || ''
      };
    }
    
    if (eventType === 'in-person' || eventType === 'hybrid') {
      locationData.address = location?.address || '';
      locationData.city = location?.city || '';
      locationData.country = location?.country || '';
      
      if (location?.coordinates && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        locationData.coordinates = location.coordinates;
      }
    }
    
    // Process recurrence settings
    let recurrenceData = null;
    if (isRecurring && recurrencePattern) {
      recurrenceData = {
        pattern: recurrencePattern,
        ...recurrenceSettings
      };
    }
    
    // Create check-in code for in-person events
    const checkInCode = eventType !== 'virtual' 
      ? Math.random().toString(36).substring(2, 8).toUpperCase()
      : null;
    
    // Create event
    const event = await Event.create({
      creator: req.user.id,
      title,
      description,
      eventType,
      category,
      tags: parsedTags,
      startDate: start,
      endDate: end,
      location: locationData,
      coverImage,
      privacy: privacy || 'public',
      checkInCode,
      isRecurring: isRecurring || false,
      recurrencePattern: recurrencePattern || null,
      recurrenceSettings: recurrenceData
    });
    
    // Update hashtags
    if (parsedTags.length > 0) {
      await updateHashtags(parsedTags, 'event');
    }
    
    // Add creator as an attendee
    event.attendees.push({
      user: req.user.id,
      status: 'going',
      respondedAt: new Date(),
      message: 'Host'
    });
    
    await event.save();
    
    // Populate creator data before response
    await event.populate('creator', 'firstName lastName profilePicture');
    
    res.status(201).json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating event'
    });
  }
};

/**
 * @route   GET /api/events
 * @desc    Get events with pagination and filters
 * @access  Private
 */
exports.getEvents = async (req, res) => {
  try {
    const {
      limit = 10,
      page = 1,
      category,
      status = 'upcoming',
      lat,
      lng,
      distance = 50,
      userId,
      search
    } = req.query;
    
    // Build query
    const query = {};
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by status
    const now = new Date();
    if (status === 'upcoming') {
      query.startDate = { $gte: now };
    } else if (status === 'past') {
      query.endDate = { $lt: now };
    } else if (status === 'ongoing') {
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    }
    
    // Filter by creator
    if (userId) {
      query.creator = userId;
    }
    
    // Text search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Apply privacy filter
    const user = await User.findById(req.user.id);
    query.$or = query.$or || [];
    query.$or.push(
      { privacy: 'public' },
      { privacy: 'private', creator: req.user.id },
      { privacy: 'invite-only', 'invitations.user': req.user.id },
      { privacy: 'invite-only', creator: req.user.id }
    );
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute query
    let events;
    
    // Check if location filter is applied
    if (lat && lng) {
      // Geo near query
      events = await Event.findNearby(
        [parseFloat(lng), parseFloat(lat)],
        parseFloat(distance) * 1000, // Convert km to meters
        {
          query,
          limit: parseInt(limit),
          skip,
          populate: 'creator'
        }
      );
    } else {
      // Regular query
      events = await Event.find(query)
        .populate('creator', 'firstName lastName profilePicture')
        .populate('attendees.user', 'firstName lastName profilePicture')
        .sort({ startDate: status === 'past' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(limit));
    }
    
    // Get total count
    const total = await Event.countDocuments(query);
    
    // Process events to include attendance status
    const enhancedEvents = events.map(event => {
      const eventObj = event.toObject ? event.toObject() : event;
      
      // Check user's attendance status
      const userAttendance = event.attendees?.find(a => 
        a.user._id?.toString() === req.user.id || a.user?.toString() === req.user.id
      );
      
      eventObj.userStatus = userAttendance ? userAttendance.status : null;
      
      // Count attendees by status
      eventObj.attendeeCounts = {
        going: event.attendees?.filter(a => a.status === 'going').length || 0,
        interested: event.attendees?.filter(a => a.status === 'interested').length || 0
      };
      
      return eventObj;
    });
    
    res.json({
      success: true,
      events: enhancedEvents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching events'
    });
  }
};

/**
 * @route   GET /api/events/:id
 * @desc    Get event by ID
 * @access  Private
 */
exports.getEventById = async (req, res) => {
  try {
    const eventId = req.params.id;
    
    // Validate event ID
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid event ID'
      });
    }
    
    // Find event
    const event = await Event.findById(eventId)
      .populate('creator', 'firstName lastName profilePicture headline')
      .populate('attendees.user', 'firstName lastName profilePicture headline')
      .populate('invitations.user', 'firstName lastName profilePicture')
      .populate('invitations.invitedBy', 'firstName lastName profilePicture');
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Check privacy
    if (event.privacy === 'private' && event.creator._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this event'
      });
    }
    
    if (event.privacy === 'invite-only' && 
        event.creator._id.toString() !== req.user.id &&
        !event.invitations.some(inv => inv.user._id.toString() === req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this event'
      });
    }
    
    // Increment views
    await Event.findByIdAndUpdate(eventId, { $inc: { views: 1 } });
    
    // Get user status
    const userAttendance = event.attendees.find(a => a.user._id.toString() === req.user.id);
    const userStatus = userAttendance ? userAttendance.status : null;
    
    // Get attendee counts
    const attendeeCounts = {
      going: event.attendees.filter(a => a.status === 'going').length,
      interested: event.attendees.filter(a => a.status === 'interested').length
    };
    
    // Create response
    const eventResponse = {
      ...event.toObject(),
      userStatus,
      attendeeCounts,
      isCreator: event.creator._id.toString() === req.user.id
    };
    
    res.json({
      success: true,
      event: eventResponse
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching event'
    });
  }
};

/**
 * @route   PUT /api/events/:id
 * @desc    Update event
 * @access  Private
 */
exports.updateEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    
    // Validate event ID
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid event ID'
      });
    }
    
    // Find event
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Check ownership
    if (event.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this event'
      });
    }
    
    // Extract fields to update
    const {
      title,
      description,
      eventType,
      category,
      tags,
      startDate,
      endDate,
      location,
      privacy,
      isRecurring,
      recurrencePattern,
      recurrenceSettings
    } = req.body;
    
    // Validate dates if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format'
        });
      }
      
      if (end <= start) {
        return res.status(400).json({
          success: false,
          error: 'End date must be after start date'
        });
      }
      
      event.startDate = start;
      event.endDate = end;
    } else if (startDate) {
      const start = new Date(startDate);
      
      if (isNaN(start.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid start date format'
        });
      }
      
      if (start >= event.endDate) {
        return res.status(400).json({
          success: false,
          error: 'Start date must be before end date'
        });
      }
      
      event.startDate = start;
    } else if (endDate) {
      const end = new Date(endDate);
      
      if (isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid end date format'
        });
      }
      
      if (end <= event.startDate) {
        return res.status(400).json({
          success: false,
          error: 'End date must be after start date'
        });
      }
      
      event.endDate = end;
    }
    
    // Process cover image if uploaded
    if (req.file) {
      const uploadResult = await fileUploadService.uploadFile(
        req.file,
        'event_covers',
        {
          transformation: [
            { width: 1200, height: 630, crop: 'fill' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        }
      );
      event.coverImage = uploadResult.url;
    }
    
    // Process tags
    if (tags) {
      const oldTags = event.tags || [];
      const parsedTags = typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags;
      
      event.tags = parsedTags;
      
      // Update hashtags
      await updateHashtags(parsedTags, 'event', oldTags);
    }
    
    // Update other fields
    if (title) event.title = title;
    if (description) event.description = description;
    if (category) event.category = category;
    if (privacy) event.privacy = privacy;
    
    // Update event type and location
    if (eventType) {
      event.eventType = eventType;
      
      // Process location based on event type
      if (location) {
        event.location = {};
        
        if (eventType === 'virtual' || eventType === 'hybrid') {
          event.location.virtual = {
            platform: location.virtual?.platform || '',
            link: location.virtual?.link || ''
          };
        }
        
        if (eventType === 'in-person' || eventType === 'hybrid') {
          event.location.address = location.address || '';
          event.location.city = location.city || '';
          event.location.country = location.country || '';
          
          if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
            event.location.coordinates = location.coordinates;
          }
        }
      }
    }
    
    // Update recurrence settings
    if (isRecurring !== undefined) {
      event.isRecurring = isRecurring;
    }
    
    if (recurrencePattern) {
      event.recurrencePattern = recurrencePattern;
      
      if (recurrenceSettings) {
        event.recurrenceSettings = recurrenceSettings;
      }
    }
    
    // Save updated event
    await event.save();
    
    // Populate creator data
    await event.populate('creator', 'firstName lastName profilePicture');
    
    // Notify attendees of changes
    if (event.attendees && event.attendees.length > 0) {
      const attendeeIds = event.attendees
        .filter(a => a.status === 'going' && a.user.toString() !== req.user.id)
        .map(a => a.user.toString());
      
      for (const attendeeId of attendeeIds) {
        await notificationService.createNotification({
          recipient: attendeeId,
          sender: req.user.id,
          type: 'event_update',
          contentType: 'event',
          contentId: event._id,
          text: `updated the event "${event.title}"`,
          actionUrl: `/events/${event._id}`
        });
      }
    }
    
    res.json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating event'
    });
  }
};

/**
 * @route   DELETE /api/events/:id
 * @desc    Delete event
 * @access  Private
 */
exports.deleteEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    
    // Validate event ID
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid event ID'
      });
    }
    
    // Find event
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Check ownership
    if (event.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this event'
      });
    }
    
    // Notify attendees of cancellation
    if (event.attendees && event.attendees.length > 0) {
      const attendeeIds = event.attendees
        .filter(a => a.status === 'going' && a.user.toString() !== req.user.id)
        .map(a => a.user.toString());
      
      for (const attendeeId of attendeeIds) {
        await notificationService.createNotification({
          recipient: attendeeId,
          sender: req.user.id,
          type: 'event_cancelled',
          contentType: 'event',
          contentId: event._id,
          text: `cancelled the event "${event.title}"`,
          actionUrl: `/events/${event._id}`
        });
      }
    }
    
    // Delete event
    await Event.findByIdAndDelete(eventId);
    
    // Update hashtags
    if (event.tags && event.tags.length > 0) {
      await updateHashtags([], 'event', event.tags);
    }
    
    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      success: false,
      error: 'Error deleting event'
    });
  }
};

/**
 * @route   POST /api/events/:id/respond
 * @desc    Respond to event (going, interested, not-going)
 * @access  Private
 */
exports.respondToEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { status, message } = req.body;
    
    // Validate status
    if (!status || !['going', 'interested', 'not-going'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }
    
    // Find event
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Check privacy
    if (event.privacy === 'private' && event.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to respond to this event'
      });
    }
    
    if (event.privacy === 'invite-only' && 
        event.creator.toString() !== req.user.id &&
        !event.invitations.some(inv => inv.user.toString() === req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to respond to this event'
      });
    }
    
    // Check if user already responded
    const existingResponse = event.attendees.findIndex(a => a.user.toString() === req.user.id);
    
    if (existingResponse !== -1) {
      // Update existing response
      event.attendees[existingResponse].status = status;
      event.attendees[existingResponse].message = message || '';
      event.attendees[existingResponse].updatedAt = new Date();
    } else {
      // Add new response
      event.attendees.push({
        user: req.user.id,
        status,
        message: message || '',
        respondedAt: new Date(),
        updatedAt: new Date()
      });
      
      // Update invitation status if applicable
      const invitationIndex = event.invitations.findIndex(inv => inv.user.toString() === req.user.id);
      
      if (invitationIndex !== -1) {
        event.invitations[invitationIndex].status = 'accepted';
      }
    }
    
    await event.save();
    
    // Notify event creator if not their own event
    if (event.creator.toString() !== req.user.id) {
      const user = await User.findById(req.user.id)
        .select('firstName lastName');
      
      await notificationService.createNotification({
        recipient: event.creator,
        sender: req.user.id,
        type: 'event_rsvp',
        contentType: 'event',
        contentId: event._id,
        text: `is ${status === 'going' ? 'attending' : (status === 'interested' ? 'interested in' : 'not attending')} your event "${event.title}"`,
        actionUrl: `/events/${event._id}`
      });
    }
    
    res.json({
      success: true,
      status,
      message: `Successfully marked as ${status}`
    });
  } catch (error) {
    console.error('Respond to event error:', error);
    res.status(500).json({
      success: false,
      error: 'Error responding to event'
    });
  }
};

/**
 * @route   POST /api/events/:id/invite
 * @desc    Invite users to event
 * @access  Private
 */
exports.inviteToEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { userIds, message } = req.body;
    
    // Validate user IDs
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No users to invite'
      });
    }
    
    // Find event
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Check permissions
    if (event.creator.toString() !== req.user.id &&
        !event.attendees.some(a => a.user.toString() === req.user.id && a.status === 'going')) {
      return res.status(403).json({
        success: false,
        error: 'Only the event creator or attendees can invite others'
      });
    }
    
    // Process invitations
    const existingInvites = event.invitations.map(inv => inv.user.toString());
    const newInvites = [];
    
    for (const userId of userIds) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        continue; // Skip invalid IDs
      }
      
      // Skip if already invited
      if (existingInvites.includes(userId)) {
        continue;
      }
      
      // Skip if already an attendee
      if (event.attendees.some(a => a.user.toString() === userId)) {
        continue;
      }
      
      // Add invitation
      event.invitations.push({
        user: userId,
        invitedBy: req.user.id,
        message: message || '',
        invitedAt: new Date(),
        status: 'pending'
      });
      
      newInvites.push(userId);
    }
    
    if (newInvites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'All users are already invited or attending'
      });
    }
    
    await event.save();
    
    // Notify invited users
    for (const userId of newInvites) {
      await notificationService.createNotification({
        recipient: userId,
        sender: req.user.id,
        type: 'event_invite',
        contentType: 'event',
        contentId: event._id,
        text: `invited you to the event "${event.title}"`,
        actionUrl: `/events/${event._id}`
      });
    }
    
    res.json({
      success: true,
      message: `Successfully invited ${newInvites.length} users`,
      invitedCount: newInvites.length
    });
  } catch (error) {
    console.error('Invite to event error:', error);
    res.status(500).json({
      success: false,
      error: 'Error inviting users to event'
    });
  }
};

/**
 * @route   GET /api/events/nearby
 * @desc    Get events near a location
 * @access  Private
 */
exports.getNearbyEvents = async (req, res) => {
  try {
    const {
      lat,
      lng,
      distance = 50, // km
      limit = 10,
      page = 1,
      category,
      status = 'upcoming'
    } = req.query;
    
    // Validate coordinates
    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
      return res.status(400).json({
        success: false,
        error: 'Valid coordinates required'
      });
    }
    
    // Build query
    const query = {};
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by status
    const now = new Date();
    if (status === 'upcoming') {
      query.startDate = { $gte: now };
    } else if (status === 'past') {
      query.endDate = { $lt: now };
    } else if (status === 'ongoing') {
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    }
    
    // Apply privacy filter
    query.$or = [
      { privacy: 'public' },
      { privacy: 'private', creator: req.user.id },
      { privacy: 'invite-only', 'invitations.user': req.user.id },
      { privacy: 'invite-only', creator: req.user.id }
    ];
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute geospatial query
    const events = await Event.findNearby(
      [parseFloat(lng), parseFloat(lat)],
      parseFloat(distance) * 1000, // Convert km to meters
      {
        query,
        limit: parseInt(limit),
        skip,
        populate: 'creator',
        sort: { startDate: status === 'past' ? -1 : 1 }
      }
    );
    
    // Process events to include attendance status and distance
    const enhancedEvents = events.map(event => {
      const eventObj = event;
      
      // Check user's attendance status
      const userAttendance = event.attendees?.find(a => 
        a.user.toString() === req.user.id
      );
      
      eventObj.userStatus = userAttendance ? userAttendance.status : null;
      
      // Count attendees by status
      eventObj.attendeeCounts = {
        going: event.attendees?.filter(a => a.status === 'going').length || 0,
        interested: event.attendees?.filter(a => a.status === 'interested').length || 0
      };
      
      // Calculate distance if coordinates available
      if (event.location?.coordinates && event.location.coordinates.length === 2) {
        const [eventLng, eventLat] = event.location.coordinates;
        
        // Simple distance calculation (Haversine formula)
        const earthRadius = 6371; // km
        const dLat = ((parseFloat(lat) - eventLat) * Math.PI) / 180;
        const dLng = ((parseFloat(lng) - eventLng) * Math.PI) / 180;
        
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((eventLat * Math.PI) / 180) * Math.cos((parseFloat(lat) * Math.PI) / 180) * 
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = earthRadius * c;
        
        eventObj.distance = parseFloat(distance.toFixed(1));
      }
      
      return eventObj;
    });
    
    // Get total count (approximate for performance)
    const total = await Event.countDocuments(query);
    
    res.json({
      success: true,
      events: enhancedEvents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get nearby events error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching nearby events'
    });
  }
};

/**
 * @route   POST /api/events/:id/check-in
 * @desc    Check in to an event
 * @access  Private
 */
exports.checkInToEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { code } = req.body;
    
    // Find event
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Validate check-in code if not creator
    if (event.creator.toString() !== req.user.id) {
      // Check if code is required and valid
      if (event.checkInCode && event.checkInCode !== code) {
        return res.status(400).json({
          success: false,
          error: 'Invalid check-in code'
        });
      }
    }
    
    // Check if user is marked as attending
    const attendeeIndex = event.attendees.findIndex(a => 
      a.user.toString() === req.user.id && a.status === 'going'
    );
    
    if (attendeeIndex === -1) {
      return res.status(400).json({
        success: false,
        error: 'You must be marked as attending this event to check in'
      });
    }
    
    // Check if already checked in
    if (event.attendees[attendeeIndex].checkedIn) {
      return res.status(400).json({
        success: false,
        error: 'Already checked in to this event'
      });
    }
    
    // Mark as checked in
    event.attendees[attendeeIndex].checkedIn = true;
    event.attendees[attendeeIndex].checkInTime = new Date();
    
    await event.save();
    
    res.json({
      success: true,
      message: 'Successfully checked in to event',
      checkInTime: event.attendees[attendeeIndex].checkInTime
    });
  } catch (error) {
    console.error('Event check-in error:', error);
    res.status(500).json({
      success: false,
      error: 'Error checking in to event'
    });
  }
};

/**
 * @route   GET /api/events/categories
 * @desc    Get event categories with counts
 * @access  Private
 */
exports.getEventCategories = async (req, res) => {
  try {
    // Aggregate events by category with counts
    const categories = await Event.aggregate([
      { $match: { startDate: { $gte: new Date() } } }, // Only upcoming events
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Format response
    const formattedCategories = categories.map(category => ({
      name: category._id,
      count: category.count
    }));
    
    res.json({
      success: true,
      categories: formattedCategories
    });
  } catch (error) {
    console.error('Get event categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching event categories'
    });
  }
};

/**
 * @route   GET /api/events/:id/attendees
 * @desc    Get event attendees
 * @access  Private
 */
exports.getEventAttendees = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { status = 'going', limit = 20, page = 1 } = req.query;
    
    // Find event
    const event = await Event.findById(eventId)
      .populate({
        path: 'attendees.user',
        select: 'firstName lastName profilePicture headline industry'
      });
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Check permissions for private events
    if (event.privacy === 'private' && event.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view attendees'
      });
    }
    
    // Filter by status
    const filteredAttendees = event.attendees.filter(a => a.status === status);
    
    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedAttendees = filteredAttendees.slice(skip, skip + parseInt(limit));
    
    // Format response
    const formattedAttendees = paginatedAttendees.map(attendee => ({
      user: attendee.user,
      status: attendee.status,
      message: attendee.message,
      respondedAt: attendee.respondedAt,
      checkedIn: attendee.checkedIn,
      checkInTime: attendee.checkInTime
    }));
    
    res.json({
      success: true,
      attendees: formattedAttendees,
      pagination: {
        total: filteredAttendees.length,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(filteredAttendees.length / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get event attendees error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching event attendees'
    });
  }
};

/**
 * @route   POST /api/events/:id/share
 * @desc    Share event as a post
 * @access  Private
 */
exports.shareEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { content } = req.body;
    
    // Find event
    const event = await Event.findById(eventId)
      .populate('creator', 'firstName lastName');
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Check if event is shareable
    if (event.privacy !== 'public' && event.creator._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'This event cannot be shared'
      });
    }
    
    // Create post
    const Post = require('../models/content/post.js');
    
    const post = await Post.create({
      author: req.user.id,
      content: content || `I'm interested in attending ${event.title}`,
      type: 'event',
      visibility: 'public',
      eventData: {
        eventId: event._id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location?.address || 'Virtual Event',
        coverImage: event.coverImage
      },
      createdAt: new Date()
    });
    
    // Increment share count for event
    await Event.findByIdAndUpdate(eventId, { $inc: { shareCount: 1 } });
    
    // Notify event creator if not own event
    if (event.creator._id.toString() !== req.user.id) {
      await notificationService.createNotification({
        recipient: event.creator._id,
        sender: req.user.id,
        type: 'event_share',
        contentType: 'event',
        contentId: event._id,
        text: `shared your event "${event.title}"`,
        actionUrl: `/posts/${post._id}`
      });
    }
    
    res.json({
      success: true,
      message: 'Event shared successfully',
      post: {
        _id: post._id,
        type: post.type,
        eventData: post.eventData
      }
    });
  } catch (error) {
    console.error('Share event error:', error);
    res.status(500).json({
      success: false,
      error: 'Error sharing event'
    });
  }
};

module.exports = exports;