// controllers/job.controller.js
const Job = require('../models/discovery/jobs.js');
const Company = require('../models/discovery/company.js');
const User = require('../models/user/user.js');
const fileUploadService = require('../services/file-upload.service.js');
const notificationService = require('../services/notification.service.js');
const { updateHashtags } = require('../utils/helpers');
const mongoose = require('mongoose');
/**
 * @route   POST /api/jobs
 * @desc    Create a new job listing
 * @access  Private
 */
exports.createJob = async (req, res) => {
  try {
    const {
      title,
      description,
      company,
      jobType,
      location,
      salary,
      experienceLevel,
      requirements,
      responsibilities,
      skills,
      industry,
      applicationDeadline,
      applicationLink
    } = req.body;
    
    // Validate required fields
    if (!title || !description || !jobType || !experienceLevel) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Process company data
    let companyData = {
      name: company?.name || '',
      logo: company?.logo || '',
      website: company?.website || ''
    };
    
    // If company ID is provided, validate and set reference
    if (company?.companyId && mongoose.Types.ObjectId.isValid(company.companyId)) {
      const existingCompany = await Company.findById(company.companyId);
      
      if (existingCompany) {
        companyData.companyId = existingCompany._id;
        companyData.name = existingCompany.name;
        companyData.logo = existingCompany.logo;
        companyData.website = existingCompany.website;
      }
    }
    
    // Process location data
    const locationData = {
      city: location?.city || '',
      country: location?.country || '',
      remote: location?.remote === true
    };
    
    // Process salary data
    const salaryData = salary ? {
      min: parseFloat(salary.min) || null,
      max: parseFloat(salary.max) || null,
      currency: salary.currency || 'USD',
      period: salary.period || 'yearly',
      isVisible: salary.isVisible !== false // Default to visible
    } : null;
    
    // Process skills
    const parsedSkills = Array.isArray(skills) 
      ? skills 
      : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()) : []);
    
    // Process requirements
    const parsedRequirements = Array.isArray(requirements)
      ? requirements
      : (typeof requirements === 'string' ? requirements.split('\n').filter(r => r.trim()) : []);
    
    // Process responsibilities
    const parsedResponsibilities = Array.isArray(responsibilities)
      ? responsibilities
      : (typeof responsibilities === 'string' ? responsibilities.split('\n').filter(r => r.trim()) : []);
    
    // Parse application deadline
    let deadline = null;
    if (applicationDeadline) {
      deadline = new Date(applicationDeadline);
      if (isNaN(deadline.getTime())) {
        deadline = null;
      }
    }
    
    // Create job
    const job = await Job.create({
      creator: req.user.id,
      company: companyData,
      title,
      description,
      jobType,
      location: locationData,
      salary: salaryData,
      requirements: parsedRequirements,
      responsibilities: parsedResponsibilities,
      skills: parsedSkills,
      experienceLevel,
      industry,
      applicationDeadline: deadline,
      applicationLink,
      active: true,
      createdAt: new Date()
    });
    
    // Update hashtags
    if (parsedSkills.length > 0) {
      await updateHashtags(parsedSkills, 'job');
    }
    
    // Populate creator data
    await job.populate('creator', 'firstName lastName profilePicture headline');
    
    res.status(201).json({
      success: true,
      job
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating job listing'
    });
  }
};

/**
 * @route   GET /api/jobs
 * @desc    Get jobs with pagination and filters
 * @access  Private
 */
exports.getJobs = async (req, res) => {
  try {
    const {
      limit = 10,
      page = 1,
      search,
      jobType,
      experienceLevel,
      industry,
      skills,
      location,
      remote,
      salaryMin,
      salaryMax,
      creatorId,
      active,
      sort = 'recent'
    } = req.query;
    
    // Build query
    const query = {};
    
    // Search by title or description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'company.name': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by job type
    if (jobType) {
      query.jobType = jobType;
    }
    
    // Filter by experience level
    if (experienceLevel) {
      query.experienceLevel = experienceLevel;
    }
    
    // Filter by industry
    if (industry) {
      query.industry = { $regex: industry, $options: 'i' };
    }
    
    // Filter by skills
    if (skills) {
      const skillsList = skills.split(',').map(s => s.trim());
      query.skills = { $in: skillsList };
    }
    
    // Filter by location
    if (location) {
      query.$or = query.$or || [];
      query.$or.push(
        { 'location.city': { $regex: location, $options: 'i' } },
        { 'location.country': { $regex: location, $options: 'i' } }
      );
    }
    
    // Filter by remote option
    if (remote === 'true' || remote === '1') {
      query['location.remote'] = true;
    }
    
    // Filter by salary range
    if (salaryMin || salaryMax) {
      query.salary = query.salary || {};
      
      if (salaryMin) {
        query.salary.max = { $gte: parseFloat(salaryMin) };
      }
      
      if (salaryMax) {
        query.salary.min = { $lte: parseFloat(salaryMax) };
      }
    }
    
    // Filter by creator
    if (creatorId) {
      query.creator = creatorId;
    }
    
    // Filter by active status
    if (active === 'true' || active === '1') {
      query.active = true;
    } else if (active === 'false' || active === '0') {
      query.active = false;
    }
    
    // Default to active jobs
    if (active === undefined) {
      query.active = true;
    }
    
    // Exclude expired jobs by default
    if (!query.applicationDeadline) {
      query.$or = query.$or || [];
      query.$or.push(
        { applicationDeadline: { $gt: new Date() } },
        { applicationDeadline: null }
      );
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Determine sort order
    let sortOption = { createdAt: -1 }; // Default to newest
    
    switch (sort) {
      case 'salary-high':
        sortOption = { 'salary.max': -1 };
        break;
      case 'salary-low':
        sortOption = { 'salary.min': 1 };
        break;
      case 'deadline':
        sortOption = { applicationDeadline: 1 };
        break;
    }
    
    // Execute query
    const jobs = await Job.find(query)
      .populate('creator', 'firstName lastName profilePicture headline')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const total = await Job.countDocuments(query);
    
    // Process jobs for response
    const processedJobs = jobs.map(job => {
      const jobObj = job.toObject();
      
      // Check if user has applied
      jobObj.hasApplied = job.applicants?.some(a => a.user.toString() === req.user.id);
      
      // Applicant count
      jobObj.applicantCount = job.applicants?.length || 0;
      
      return jobObj;
    });
    
    res.json({
      success: true,
      jobs: processedJobs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching job listings'
    });
  }
};

/**
 * @route   GET /api/jobs/:id
 * @desc    Get job by ID
 * @access  Private
 */
exports.getJobById = async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Validate job ID
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID'
      });
    }
    
    // Find job
    const job = await Job.findById(jobId)
      .populate('creator', 'firstName lastName profilePicture headline')
      .populate('company.companyId', 'name logo website description industry size');
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Check if user has applied
    const hasApplied = job.applicants?.some(a => a.user.toString() === req.user.id);
    
    // Get applicant count
    const applicantCount = job.applicants?.length || 0;
    
    // Increment view count
    await Job.findByIdAndUpdate(jobId, { $inc: { views: 1 } });
    
    // Create response
    const jobResponse = {
      ...job.toObject(),
      hasApplied,
      applicantCount,
      isCreator: job.creator._id.toString() === req.user.id
    };
    
    res.json({
      success: true,
      job: jobResponse
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching job'
    });
  }
};

/**
 * @route   PUT /api/jobs/:id
 * @desc    Update job
 * @access  Private
 */
exports.updateJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Validate job ID
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID'
      });
    }
    
    // Find job
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Check ownership
    if (job.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this job'
      });
    }
    
    // Extract fields to update
    const {
      title,
      description,
      company,
      jobType,
      location,
      salary,
      experienceLevel,
      requirements,
      responsibilities,
      skills,
      industry,
      applicationDeadline,
      applicationLink,
      active
    } = req.body;
    
    // Update company data if provided
    if (company) {
      job.company = {
        ...job.company,
        name: company.name || job.company.name,
        logo: company.logo || job.company.logo,
        website: company.website || job.company.website
      };
      
      // If company ID is provided, validate and update
      if (company.companyId && mongoose.Types.ObjectId.isValid(company.companyId)) {
        const existingCompany = await Company.findById(company.companyId);
        
        if (existingCompany) {
          job.company.companyId = existingCompany._id;
          job.company.name = existingCompany.name;
          job.company.logo = existingCompany.logo;
          job.company.website = existingCompany.website;
        }
      }
    }
    
    // Update location data if provided
    if (location) {
      job.location = {
        city: location.city || job.location.city,
        country: location.country || job.location.country,
        remote: location.remote !== undefined ? location.remote : job.location.remote
      };
    }
    
    // Update salary data if provided
    if (salary) {
      job.salary = {
        min: parseFloat(salary.min) || job.salary?.min,
        max: parseFloat(salary.max) || job.salary?.max,
        currency: salary.currency || job.salary?.currency || 'USD',
        period: salary.period || job.salary?.period || 'yearly',
        isVisible: salary.isVisible !== undefined ? salary.isVisible : job.salary?.isVisible
      };
    }
    
    // Process skills if provided
    if (skills) {
      const oldSkills = job.skills || [];
      const parsedSkills = Array.isArray(skills) 
        ? skills 
        : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()) : []);
      
      job.skills = parsedSkills;
      
      // Update hashtags
      await updateHashtags(parsedSkills, 'job', oldSkills);
    }
    
    // Process requirements if provided
    if (requirements) {
      job.requirements = Array.isArray(requirements)
        ? requirements
        : (typeof requirements === 'string' ? requirements.split('\n').filter(r => r.trim()) : job.requirements);
    }
    
    // Process responsibilities if provided
    if (responsibilities) {
      job.responsibilities = Array.isArray(responsibilities)
        ? responsibilities
        : (typeof responsibilities === 'string' ? responsibilities.split('\n').filter(r => r.trim()) : job.responsibilities);
    }
    
    // Parse application deadline if provided
    if (applicationDeadline) {
      const deadline = new Date(applicationDeadline);
      if (!isNaN(deadline.getTime())) {
        job.applicationDeadline = deadline;
      }
    }
    
    // Update other fields if provided
    if (title) job.title = title;
    if (description) job.description = description;
    if (jobType) job.jobType = jobType;
    if (experienceLevel) job.experienceLevel = experienceLevel;
    if (industry) job.industry = industry;
    if (applicationLink) job.applicationLink = applicationLink;
    if (active !== undefined) job.active = active;
    
    // Update timestamp
    job.updatedAt = new Date();
    
    // Save updated job
    await job.save();
    
    // Populate fields for response
    await job.populate('creator', 'firstName lastName profilePicture headline');
    await job.populate('company.companyId', 'name logo website');
    
    res.json({
      success: true,
      job
    });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating job listing'
    });
  }
};

/**
 * @route   DELETE /api/jobs/:id
 * @desc    Delete job
 * @access  Private
 */
exports.deleteJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Validate job ID
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID'
      });
    }
    
    // Find job
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Check ownership
    if (job.creator.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this job'
      });
    }
    
    // Delete job
    await Job.findByIdAndDelete(jobId);
    
    // Update hashtags
    if (job.skills && job.skills.length > 0) {
      await updateHashtags([], 'job', job.skills);
    }
    
    res.json({
      success: true,
      message: 'Job listing deleted successfully'
    });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({
      success: false,
      error: 'Error deleting job listing'
    });
  }
};

/**
 * @route   POST /api/jobs/:id/apply
 * @desc    Apply to a job
 * @access  Private
 */
exports.applyToJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const { coverLetter, resumeUrl } = req.body;
    
    // Validate job ID
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID'
      });
    }
    
    // Find job
    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Check if job is active
    if (!job.active) {
      return res.status(400).json({
        success: false,
        error: 'This job listing is no longer active'
      });
    }
    
    // Check deadline
    if (job.applicationDeadline && new Date() > job.applicationDeadline) {
      return res.status(400).json({
        success: false,
        error: 'Application deadline has passed'
      });
    }
    
  // Check if already applied
  if (job.applicants && job.applicants.some(a => a.user.toString() === req.user.id)) {
    return res.status(400).json({
      success: false,
      error: 'You have already applied to this job'
    });
  }
  
  // Cannot apply to own job
  if (job.creator.toString() === req.user.id) {
    return res.status(400).json({
      success: false,
      error: 'You cannot apply to your own job listing'
    });
  }
  
  // Process resume if uploaded
  let resumeLink = resumeUrl;
  if (req.file) {
    const uploadResult = await fileUploadService.uploadFile(
      req.file,
      'job_applications',
      {
        resource_type: 'auto'
      }
    );
    resumeLink = uploadResult.url;
  }
  
  // Add application
  job.applicants.push({
    user: req.user.id,
    status: 'applied',
    appliedAt: new Date(),
    coverLetter: coverLetter || '',
    resumeUrl: resumeLink
  });
  
  await job.save();
  
  // Notify job creator
  const user = await User.findById(req.user.id)
    .select('firstName lastName profilePicture headline');
  
  await notificationService.createNotification({
    recipient: job.creator,
    sender: req.user.id,
    type: 'job_application',
    contentType: 'job',
    contentId: job._id,
    text: `applied to your job listing "${job.title}"`,
    actionUrl: `/jobs/${job._id}/applications`
  });
  
  res.json({
    success: true,
    message: 'Successfully applied to job',
    applicationDate: new Date()
  });
} catch (error) {
  console.error('Apply to job error:', error);
  res.status(500).json({
    success: false,
    error: 'Error applying to job'
  });
}
};

/**
* @route   GET /api/jobs/:id/applications
* @desc    Get job applications
* @access  Private
*/
exports.getJobApplications = async (req, res) => {
try {
  const jobId = req.params.id;
  
  // Validate job ID
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid job ID'
    });
  }
  
  // Find job
  const job = await Job.findById(jobId)
    .populate({
      path: 'applicants.user',
      select: 'firstName lastName profilePicture headline industry location'
    });
  
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found'
    });
  }
  
  // Check ownership
  if (job.creator.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to view applications'
    });
  }
  
  // Format response
  const applications = job.applicants.map(app => ({
    id: app._id,
    user: app.user,
    status: app.status,
    appliedAt: app.appliedAt,
    coverLetter: app.coverLetter,
    resumeUrl: app.resumeUrl
  }));
  
  res.json({
    success: true,
    applications,
    total: applications.length
  });
} catch (error) {
  console.error('Get job applications error:', error);
  res.status(500).json({
    success: false,
    error: 'Error fetching job applications'
  });
}
};

/**
* @route   PUT /api/jobs/:id/applications/:applicationId
* @desc    Update application status
* @access  Private
*/
exports.updateApplicationStatus = async (req, res) => {
try {
  const { id: jobId, applicationId } = req.params;
  const { status } = req.body;
  
  // Validate status
  if (!status || !['reviewing', 'interviewed', 'offered', 'hired', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid status'
    });
  }
  
  // Find job
  const job = await Job.findById(jobId);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found'
    });
  }
  
  // Check ownership
  if (job.creator.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to update application'
    });
  }
  
  // Find application
  const applicationIndex = job.applicants.findIndex(
    app => app._id.toString() === applicationId
  );
  
  if (applicationIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'Application not found'
    });
  }
  
  // Update status
  const oldStatus = job.applicants[applicationIndex].status;
  job.applicants[applicationIndex].status = status;
  
  await job.save();
  
  // Notify applicant
  await notificationService.createNotification({
    recipient: job.applicants[applicationIndex].user,
    sender: req.user.id,
    type: 'application_update',
    contentType: 'job',
    contentId: job._id,
    text: `updated your application status to "${status}" for the job "${job.title}"`,
    actionUrl: `/jobs/${job._id}`
  });
  
  res.json({
    success: true,
    message: `Application status updated from ${oldStatus} to ${status}`,
    applicationId,
    status
  });
} catch (error) {
  console.error('Update application status error:', error);
  res.status(500).json({
    success: false,
    error: 'Error updating application status'
  });
}
};

/**
* @route   POST /api/jobs/:id/save
* @desc    Save/unsave job
* @access  Private
*/
exports.saveJob = async (req, res) => {
try {
  const jobId = req.params.id;
  
  // Find job
  const job = await Job.findById(jobId);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found'
    });
  }
  
  // Check if already saved
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }
  
  // Initialize saved jobs array if doesn't exist
  if (!user.savedJobs) {
    user.savedJobs = [];
  }
  
  const isSaved = user.savedJobs.includes(jobId);
  
  // Toggle saved status
  if (isSaved) {
    user.savedJobs = user.savedJobs.filter(id => id.toString() !== jobId);
  } else {
    user.savedJobs.push(jobId);
  }
  
  await user.save();
  
  res.json({
    success: true,
    isSaved: !isSaved,
    message: isSaved ? 'Job removed from saved jobs' : 'Job saved successfully'
  });
} catch (error) {
  console.error('Save job error:', error);
  res.status(500).json({
    success: false,
    error: 'Error saving job'
  });
}
};

/**
* @route   GET /api/jobs/saved
* @desc    Get saved jobs
* @access  Private
*/
exports.getSavedJobs = async (req, res) => {
try {
  const { limit = 10, page = 1 } = req.query;
  
  // Find user with saved jobs
  const user = await User.findById(req.user.id)
    .select('savedJobs');
  
  if (!user || !user.savedJobs || user.savedJobs.length === 0) {
    return res.json({
      success: true,
      jobs: [],
      pagination: {
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: 0
      }
    });
  }
  
  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // Get saved jobs with pagination
  const jobs = await Job.find({
    _id: { $in: user.savedJobs }
  })
    .populate('creator', 'firstName lastName profilePicture headline')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
  
  // Get total count
  const total = user.savedJobs.length;
  
  res.json({
    success: true,
    jobs,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
    }
  });
} catch (error) {
  console.error('Get saved jobs error:', error);
  res.status(500).json({
    success: false,
    error: 'Error fetching saved jobs'
  });
}
};

/**
* @route   GET /api/jobs/recommended
* @desc    Get personalized job recommendations
* @access  Private
*/
exports.getRecommendedJobs = async (req, res) => {
try {
  const { limit = 10 } = req.query;
  
  // Get user profile
  const user = await User.findById(req.user.id)
    .select('skills portfolio.workExperience industry');
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }
  
  // Extract user skills
  const userSkills = user.skills ? user.skills.map(s => s.name.toLowerCase()) : [];
  
  // Extract industries from work experience
  let userIndustries = [];
  if (user.portfolio && user.portfolio.workExperience) {
    userIndustries = user.portfolio.workExperience
      .filter(exp => exp.company)
      .map(exp => exp.company.toLowerCase());
  }
  
  // Add current industry if available
  if (user.industry) {
    userIndustries.push(user.industry.toLowerCase());
  }
  
  // Build recommendation query
  const query = {
    active: true,
    $or: [
      { applicationDeadline: { $gt: new Date() } },
      { applicationDeadline: null }
    ]
  };
  
  // Add skills match if available
  if (userSkills.length > 0) {
    query.$or = query.$or || [];
    query.$or.push(
      { skills: { $in: userSkills } }
    );
  }
  
  // Add industry match if available
  if (userIndustries.length > 0) {
    const industryRegexes = userIndustries.map(ind => 
      new RegExp(ind, 'i')
    );
    
    query.$or = query.$or || [];
    query.$or.push(
      { industry: { $in: industryRegexes } }
    );
  }
  
  // Find jobs that match user profile
  const jobs = await Job.find(query)
    .populate('creator', 'firstName lastName profilePicture headline')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));
  
  // If not enough recommendations based on skills/industry,
  // add some recent jobs to fill the quota
  if (jobs.length < parseInt(limit)) {
    const additionalCount = parseInt(limit) - jobs.length;
    
    if (additionalCount > 0) {
      const existingIds = jobs.map(job => job._id);
      
      const additionalJobs = await Job.find({
        _id: { $nin: existingIds },
        active: true,
        $or: [
          { applicationDeadline: { $gt: new Date() } },
          { applicationDeadline: null }
        ]
      })
        .populate('creator', 'firstName lastName profilePicture headline')
        .sort({ createdAt: -1 })
        .limit(additionalCount);
      
      jobs.push(...additionalJobs);
    }
  }
  
  res.json({
    success: true,
    jobs,
    total: jobs.length
  });
} catch (error) {
  console.error('Get recommended jobs error:', error);
  res.status(500).json({
    success: false,
    error: 'Error fetching job recommendations'
  });
}
};

/**
* @route   GET /api/jobs/types
* @desc    Get job types and experience levels
* @access  Private
*/
exports.getJobMetadata = async (req, res) => {
try {
  // Job types
  const jobTypes = [
    'full-time',
    'part-time',
    'contract',
    'internship',
    'remote'
  ];
  
  // Experience levels
  const experienceLevels = [
    'entry',
    'mid',
    'senior',
    'lead',
    'executive'
  ];
  
  // Get industry distribution
  const industries = await Job.aggregate([
    { $match: { active: true } },
    { $group: { _id: '$industry', count: { $sum: 1 } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  
  // Get skill distribution
  const skills = await Job.aggregate([
    { $match: { active: true } },
    { $unwind: '$skills' },
    { $group: { _id: '$skills', count: { $sum: 1 } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1 } },
    { $limit: 30 }
  ]);
  
  res.json({
    success: true,
    jobTypes,
    experienceLevels,
    industries: industries.map(i => ({ name: i._id, count: i.count })),
    skills: skills.map(s => ({ name: s._id, count: s.count }))
  });
} catch (error) {
  console.error('Get job metadata error:', error);
  res.status(500).json({
    success: false,
    error: 'Error fetching job metadata'
  });
}
};

module.exports = exports;
