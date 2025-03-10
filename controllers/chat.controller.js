const ChatRoom = require('../models/chatRoom.js')
const Message = require('../models/Message.js');
const User = require('./models/user.js');

// Create a new chat
const createChat = async (req, res) => {
  try {
    const { participantId, type = 'direct', name = '', description = '' } = req.body;

    // If direct chat, check for existing chat first
    if (type === 'direct') {
      const existingChat = await ChatRoom.findOne({
        type: 'direct',
        participants: { 
          $all: [req.user.id, participantId],
          $size: 2
        }
      }).populate('participants', 'firstName lastName profilePicture');

      if (existingChat) {
        return res.json(existingChat);
      }
    }

    // Create new chat
    const chatRoom = await ChatRoom.create({
      type,
      name,
      description,
      participants: type === 'direct' ? [req.user.id, participantId] : [req.user.id],
      admin: req.user.id
    });

    // Populate participants for response
    await chatRoom.populate('participants', 'firstName lastName profilePicture');

    res.status(201).json(chatRoom);
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Error creating chat', details: error.message });
  }
};

// Get all chats for a user
const getChats = async (req, res) => {
  try {
    const chats = await ChatRoom.find({
      participants: req.user.id
    })
    .populate('participants', 'firstName lastName profilePicture online lastActive')
    .populate('lastMessage')
    .sort('-lastActivity')
    .exec();

    res.json(chats);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Error fetching chats' });
  }
};

// Get a single chat by ID
const getChatById = async (req, res) => {
  try {
    const chat = await ChatRoom.findById(req.params.chatId)
      .populate('participants', 'firstName lastName profilePicture online lastActive')
      .populate('lastMessage')
      .exec();
      
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Verify user is a participant
    if (!chat.participants.some(p => p._id.toString() === req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to access this chat' });
    }
    
    res.json(chat);
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'Error fetching chat' });
  }
};

// Send a message in a chat
const sendMessage = async (req, res) => {
  try {
    const { content, messageType = 'text', replyTo } = req.body;
    const chatId = req.params.chatId;
    
    // Validate chat exists
    const chatRoom = await ChatRoom.findById(chatId);
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    // Verify user is a participant in this chat
    if (!chatRoom.participants.some(participant => participant.toString() === req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to send messages in this chat' });
    }

    // Determine recipient (for direct chats)
    const recipient = chatRoom.type === 'direct' 
      ? chatRoom.participants.find(participant => participant.toString() !== req.user.id)
      : chatRoom.participants[0]; // Default to first participant for group chats
    
    // Create message object
    const messageData = {
      sender: req.user.id,
      chatRoom: chatId,
      recipient,
      content: content || '',
      messageType
    };
    
    // Add reply reference if provided
    if (replyTo) {
      // Verify reply message exists
      const replyMessage = await Message.findById(replyTo);
      if (!replyMessage) {
        return res.status(404).json({ error: 'Reply message not found' });
      }
      
      messageData.replyTo = replyTo;
    }
    
    // Create the message
    const message = await Message.create(messageData);

    // Populate sender and recipient details
    await message.populate('sender', 'firstName lastName profilePicture');
    await message.populate('recipient', 'firstName lastName profilePicture');
    
    // If replying to a message, populate that message too
    if (replyTo) {
      await message.populate({
        path: 'replyTo',
        select: 'content sender messageType mediaUrl',
        populate: {
          path: 'sender',
          select: 'firstName lastName profilePicture'
        }
      });
    }

    // Update chat room's last message and activity
    await ChatRoom.findByIdAndUpdate(chatId, {
      lastMessage: message._id,
      lastActivity: new Date()
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Error sending message' });
  }
};

// Get messages for a chat
const getMessages = async (req, res) => {
  try {
    const { limit = 50, before, after, lastMessageId } = req.query;
    
    // Verify chat exists and user is a participant
    const chat = await ChatRoom.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    if (!chat.participants.some(p => p.toString() === req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to access this chat' });
    }
    
    // Build query
    let query = {
      chatRoom: req.params.chatId,
      deletedFor: { $ne: req.user.id }
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    if (after) {
      query.createdAt = { $gt: new Date(after) };
    }

    if (lastMessageId) {
      const lastMessage = await Message.findById(lastMessageId);
      if (lastMessage) {
        query.createdAt = { $gt: lastMessage.createdAt };
      }
    }

    const messages = await Message.find(query)
      .populate('sender', 'firstName lastName profilePicture')
      .populate('recipient', 'firstName lastName profilePicture')
      .populate('replyTo')
      .sort('createdAt')
      .limit(parseInt(limit));

    const hasMore = messages.length === parseInt(limit);
    const nextCursor = hasMore ? messages[messages.length - 1]._id : null;

    res.json({
      messages,
      hasMore,
      nextCursor
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Error fetching messages' });
  }
};

// Delete a message
const deleteMessage = async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    
    // Check if message exists
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user is the sender or has permission to delete
    if (message.sender.toString() !== req.user.id) {
      // Check if user is chat admin if it's a group chat
      const chatRoom = await ChatRoom.findById(chatId);
      if (!chatRoom || (chatRoom.type === 'group' && chatRoom.admin.toString() !== req.user.id)) {
        return res.status(403).json({ error: 'Not authorized to delete this message' });
      }
    }
    
    // Soft delete by marking message as deleted for the user
    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { deletedFor: req.user.id }
    });
    
    res.json({ success: true, messageId });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Error deleting message' });
  }
};

// React to a message
const reactToMessage = async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { reaction } = req.body;
    
    if (!reaction) {
      return res.status(400).json({ error: 'Reaction is required' });
    }
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user has already reacted with this reaction
    const existingReactionIndex = message.reactions.findIndex(
      r => r.user.toString() === req.user.id && r.reaction === reaction
    );
    
    if (existingReactionIndex !== -1) {
      // Remove existing reaction (toggle behavior)
      message.reactions.splice(existingReactionIndex, 1);
    } else {
      // Remove any existing reaction by this user
      message.reactions = message.reactions.filter(
        r => r.user.toString() !== req.user.id
      );
      
      // Add the new reaction
      message.reactions.push({
        user: req.user.id,
        reaction
      });
    }
    
    await message.save();
    
    res.json({
      success: true,
      messageId,
      userId: req.user.id,
      reactions: message.reactions
    });
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ error: 'Error adding reaction to message' });
  }
};

// Create a poll in a chat
const createPoll = async (req, res) => {
  try {
    const { question, options, multipleChoice, expiresIn } = req.body;
    const chatId = req.params.chatId;
    
    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Invalid poll data' });
    }
    
    const chatRoom = await ChatRoom.findById(chatId);
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is a participant
      const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to create poll' });
    }
    
    // Create poll
    const pollOptions = options.map(option => ({
      text: option,
      votes: []
    }));
    
    // Calculate expiration time (default: 24 hours)
    const expirationHours = expiresIn ? parseInt(expiresIn) : 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);
    
    const poll = {
      creator: req.user.id,
      question,
      options: pollOptions,
      multipleChoice: multipleChoice === true,
      expiresAt,
      createdAt: new Date()
    };
    
    chatRoom.polls.push(poll);
    await chatRoom.save();
    
    // Send message about poll creation
    const message = await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants[0],
      chatRoom: chatRoom._id,
      content: `Created poll: ${question}`,
      messageType: 'poll',
      metadata: {
        pollId: chatRoom.polls[chatRoom.polls.length - 1]._id
      }
    });
    
    // Update chat room last message
    chatRoom.lastMessage = message._id;
    chatRoom.lastActivity = new Date();
    await chatRoom.save();
    
    res.status(201).json(chatRoom.polls[chatRoom.polls.length - 1]);
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ error: 'Error creating poll' });
  }
};

// Vote in a poll
const votePoll = async (req, res) => {
  try {
    const { chatId, pollId } = req.params;
    const { optionIndex } = req.body;
    
    if (optionIndex === undefined) {
      return res.status(400).json({ error: 'Option index is required' });
    }
    
    const chatRoom = await ChatRoom.findById(chatId);
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Find the poll
    const pollIndex = chatRoom.polls.findIndex(
      poll => poll._id.toString() === pollId
    );
    
    if (pollIndex === -1) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    
    const poll = chatRoom.polls[pollIndex];
    
    // Check if poll has expired
    if (poll.expiresAt < new Date() || poll.closed) {
      return res.status(400).json({ error: 'Poll has expired or is closed' });
    }
    
    // Check if option index is valid
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).json({ error: 'Invalid option index' });
    }
    
    // If not multiple choice, remove any existing votes by this user
    if (!poll.multipleChoice) {
      poll.options.forEach(option => {
        option.votes = option.votes.filter(vote => vote.toString() !== req.user.id);
      });
    }
    
    // Check if user already voted for this option
    const optionVotes = poll.options[optionIndex].votes;
    const alreadyVoted = optionVotes.some(vote => vote.toString() === req.user.id);
    
    if (alreadyVoted) {
      // Remove vote (toggle)
      poll.options[optionIndex].votes = optionVotes.filter(
        vote => vote.toString() !== req.user.id
      );
    } else {
      // Add vote
      poll.options[optionIndex].votes.push(req.user.id);
    }
    
    await chatRoom.save();
    
    res.json({
      success: true,
      poll: chatRoom.polls[pollIndex]
    });
  } catch (error) {
    console.error('Vote poll error:', error);
    res.status(500).json({ error: 'Error voting in poll' });
  }
};

// Initialize call in a chat
const initializeCall = async (req, res) => {
  try {
    const { callType } = req.body;
    const chatId = req.params.chatId;
    
    if (!['audio', 'video'].includes(callType)) {
      return res.status(400).json({ error: 'Invalid call type' });
    }
    
    const chatRoom = await ChatRoom.findById(chatId);
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is a participant
    const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to initiate call' });
    }
    
    // Create call history entry
    const callHistory = {
      initiator: req.user.id,
      callType,
      startTime: new Date(),
      participants: [{
        user: req.user.id,
        joinedAt: new Date()
      }],
      status: 'missed' // Default status until someone joins
    };
    
    chatRoom.callHistory.push(callHistory);
    await chatRoom.save();
    
    // Create system message about call
    await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants.find(id => id.toString() !== req.user.id),
      chatRoom: chatRoom._id,
      content: `${callType === 'audio' ? 'Audio' : 'Video'} call started`,
      messageType: 'call',
      metadata: {
        callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
        callType
      }
    });
    
    res.json({
      callId: chatRoom.callHistory[chatRoom.callHistory.length - 1]._id,
      startTime: callHistory.startTime
    });
  } catch (error) {
    console.error('Initiate call error:', error);
    res.status(500).json({ error: 'Error initiating call' });
  }
};

// Accept call
const acceptCall = async (req, res) => {
  try {
    const { chatId, callId } = req.params;
    
    // Find chat room containing this call
    const chatRoom = await ChatRoom.findById(chatId);
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Find the specific call in the history
    const callIndex = chatRoom.callHistory.findIndex(
      call => call._id.toString() === callId
    );
    
    if (callIndex === -1) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Check if user is a participant in the chat
    const isParticipant = chatRoom.participants.some(
      participant => participant.toString() === req.user.id
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not authorized to accept this call' });
    }
    
    // Check if user is already in the call
    const isInCall = chatRoom.callHistory[callIndex].participants.some(
      participant => participant.user.toString() === req.user.id
    );
    
    if (!isInCall) {
      // Add user to call participants
      chatRoom.callHistory[callIndex].participants.push({
        user: req.user.id,
        joinedAt: new Date()
      });
      
      // Update call status
      chatRoom.callHistory[callIndex].status = 'completed';
    }
    
    await chatRoom.save();
    
    res.json({
      success: true,
      callId,
      acceptedBy: req.user.id
    });
  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ error: 'Error accepting call' });
  }
};

// End call
const endCall = async (req, res) => {
  try {
    const { chatId, callId } = req.params;
    
    // Find chat room containing this call
    const chatRoom = await ChatRoom.findById(chatId);
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Find the specific call in the history
    const callIndex = chatRoom.callHistory.findIndex(
      call => call._id.toString() === callId
    );
    
    if (callIndex === -1) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Check if user is a participant in the call
    const isInCall = chatRoom.callHistory[callIndex].participants.some(
      participant => participant.user.toString() === req.user.id
    );
    
    if (!isInCall) {
      return res.status(403).json({ error: 'Not authorized to end this call' });
    }
    
    // Set end time and calculate duration
    const endTime = new Date();
    const startTime = chatRoom.callHistory[callIndex].startTime;
    const durationMs = endTime - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);
    
    // Update call record
    chatRoom.callHistory[callIndex].endTime = endTime;
    chatRoom.callHistory[callIndex].duration = durationSeconds;
    
    // Update user's left time
    const participantIndex = chatRoom.callHistory[callIndex].participants.findIndex(
      participant => participant.user.toString() === req.user.id
    );
    
    if (participantIndex !== -1) {
      chatRoom.callHistory[callIndex].participants[participantIndex].leftAt = endTime;
    }
    
    // If all participants have left, mark call as ended
    const allLeft = chatRoom.callHistory[callIndex].participants.every(
      participant => participant.leftAt
    );
    
    if (allLeft) {
      chatRoom.callHistory[callIndex].status = 'completed';
    }
    
    await chatRoom.save();
    
    // Create system message about call ending
    await Message.create({
      sender: req.user.id,
      recipient: chatRoom.participants.find(id => id.toString() !== req.user.id),
      chatRoom: chatRoom._id,
      content: `Call ended (${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')})`,
      messageType: 'call',
      metadata: {
        callId,
        callType: chatRoom.callHistory[callIndex].callType,
        status: 'ended',
        duration: durationSeconds
      }
    });
    
    res.json({
      success: true,
      callId,
      endedBy: req.user.id,
      duration: durationSeconds
    });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ error: 'Error ending call' });
  }
};

module.exports = {
  createChat,
  getChats,
  getChatById,
  sendMessage,
  getMessages,
  deleteMessage,
  reactToMessage,
  createPoll,
  votePoll,
  initializeCall,
  acceptCall,
  endCall
};