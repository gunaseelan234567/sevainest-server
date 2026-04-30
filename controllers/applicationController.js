const Application = require('../models/Application');
const Service = require('../models/Service');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const sendEmail = require('../utils/sendEmail');

// @desc    Submit new application
// @route   POST /api/applications
// @access  Private/Agent
exports.submitApplication = async (req, res, next) => {
  try {
    let { serviceId, formData } = req.body;

    // Parse formData if stringified (Multer)
    if (typeof formData === 'string') {
      formData = JSON.parse(formData);
    }

    // Handle Uploaded Files
    const uploadedFiles = req.files ? req.files.map(file => ({
      fieldName: file.fieldname,
      fileName: file.originalname,
      fileUrl: `/${file.path.replace(/\\/g, '/')}`
    })) : [];

    // Get service details
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Check wallet balance
    const user = await User.findById(req.user.id);
    if (user.walletBalance < service.chargeAmount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Create application
    const application = await Application.create({
      serviceId,
      agentId: req.user.id,
      formData,
      uploadedFiles,
      chargeDeducted: service.chargeAmount
    });

    // Deduct from wallet
    user.walletBalance -= service.chargeAmount;
    await user.save();

    // Log transaction
    await WalletTransaction.create({
      agentId: req.user.id,
      type: 'debit',
      amount: service.chargeAmount,
      reason: `Application submitted for ${service.title}`,
      performedBy: req.user.id,
      balanceAfter: user.walletBalance
    });

    res.status(201).json({ success: true, data: application });
  } catch (err) {
    next(err);
  }
};

// @desc    Get agent applications
// @route   GET /api/applications/my
// @access  Private/Agent
exports.getMyApplications = async (req, res, next) => {
  try {
    const applications = await Application.find({ agentId: req.user.id })
      .populate('serviceId', 'title category')
      .sort('-createdAt');
    res.status(200).json({ success: true, count: applications.length, data: applications });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all applications (Admin)
// @route   GET /api/applications
// @access  Private/Admin
exports.getApplications = async (req, res, next) => {
  try {
    const applications = await Application.find()
      .populate('serviceId', 'title category')
      .populate('agentId', 'name email')
      .sort('-createdAt');
    res.status(200).json({ success: true, count: applications.length, data: applications });
  } catch (err) {
    next(err);
  }
};

// @desc    Update application status (Admin)
// @route   PATCH /api/applications/:id
// @access  Private/Admin
exports.updateApplicationStatus = async (req, res, next) => {
  try {
    const { status, adminRemark } = req.body;
    
    let application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    application.status = status;
    application.adminRemark = adminRemark || application.adminRemark;

    // If rejected, refund the chargeDeducted to the agent's wallet
    if (status === 'rejected') {
      const agent = await User.findById(application.agentId);
      if (agent) {
        agent.walletBalance += application.chargeDeducted;
        await agent.save();

        // Log refund transaction
        await WalletTransaction.create({
          agentId: agent._id,
          type: 'credit',
          amount: application.chargeDeducted,
          reason: `Refund for rejected application ${application.applicationId}`,
          performedBy: req.user.id,
          balanceAfter: agent.walletBalance
        });
      }
    }

    await application.save();

    // Notify agent via email
    try {
      const populatedApp = await Application.findById(application._id)
        .populate('agentId', 'name email')
        .populate('serviceId', 'title');

      if (populatedApp && populatedApp.agentId) {
        await sendEmail({
          email: populatedApp.agentId.email,
          subject: `Application Update: ${populatedApp.applicationId} - ${status.toUpperCase()}`,
          message: `Hello ${populatedApp.agentId.name},\n\nYour application for "${populatedApp.serviceId.title}" has been updated.\n\nApplication ID: ${populatedApp.applicationId}\nNew Status: ${status.toUpperCase()}\n\nRemark: ${adminRemark || 'None'}\n\n${status === 'rejected' ? `Note: Since the application was rejected, the fee of ₹${populatedApp.chargeDeducted} has been refunded to your wallet.\n\n` : ''}Please log in to your dashboard to see more details.\n\nBest regards,\nSevainest Team`,
        });
      }
    } catch (err) {
      console.error('Status update email could not be sent');
    }

    res.status(200).json({ success: true, data: application });
  } catch (err) {
    next(err);
  }
};

// @desc    Resubmit a returned application (Agent)
// @route   PATCH /api/applications/:id/resubmit
// @access  Private/Agent
exports.resubmitApplication = async (req, res, next) => {
  try {
    let { formData } = req.body;
    if (typeof formData === 'string') {
      formData = JSON.parse(formData);
    }

    let application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Ensure it belongs to agent and is in returned status
    if (application.agentId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to resubmit this application' });
    }

    if (application.status !== 'returned') {
      return res.status(400).json({ message: 'Only returned applications can be resubmitted' });
    }

    // Update files if provided
    const newFiles = req.files ? req.files.map(file => ({
      fieldName: file.fieldname,
      fileName: file.originalname,
      fileUrl: `/${file.path.replace(/\\/g, '/')}`
    })) : [];

    if (newFiles.length > 0) {
      application.uploadedFiles = newFiles;
    }

    application.formData = formData;
    application.status = 'pending';
    application.adminRemark = ''; // Clear remark
    application.isResubmitted = true; // Mark as resubmitted

    await application.save();

    res.status(200).json({ success: true, data: application });
  } catch (err) {
    next(err);
  }
};

// @desc    Get agent stats
// @route   GET /api/applications/stats
// @access  Private/Agent
exports.getAgentStats = async (req, res, next) => {
  try {
    const stats = await Application.aggregate([
      { $match: { agentId: new (require('mongoose').Types.ObjectId)(req.user.id) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const formattedStats = {
      submitted: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    stats.forEach(s => {
      if (s._id === 'pending') formattedStats.pending = s.count;
      if (s._id === 'approved') formattedStats.approved = s.count;
      if (s._id === 'rejected') formattedStats.rejected = s.count;
    });

    formattedStats.submitted = formattedStats.pending + formattedStats.approved + formattedStats.rejected;

    res.status(200).json({ success: true, data: formattedStats });
  } catch (err) {
    next(err);
  }
};
// @desc    Get admin dashboard stats
// @route   GET /api/applications/admin-stats
// @access  Private/Admin
exports.getAdminDashboardStats = async (req, res, next) => {
  try {
    // 1. Registered Agents Count
    const totalAgents = await User.countDocuments({ role: 'agent' });

    // 2. Pending Agent Requests
    const pendingAgents = await User.countDocuments({ status: 'pending' });

    // 3. Total Earnings (Sum of all chargeDeducted)
    const earningsResult = await Application.aggregate([
      { $group: { _id: null, total: { $sum: '$chargeDeducted' } } }
    ]);
    const totalEarnings = earningsResult.length > 0 ? earningsResult[0].total : 0;

    // 4. All Applications Count
    const totalApplications = await Application.countDocuments();

    // 5. Pie Chart Data (Status Breakdown)
    const statusStats = await Application.aggregate([
      { $group: { _id: '$status', value: { $sum: 1 } } }
    ]);
    const pieData = statusStats.map(s => ({
      name: s._id.charAt(0).toUpperCase() + s._id.slice(1),
      value: s.value,
      color: s._id === 'approved' ? '#22C55E' : s._id === 'pending' ? '#F59E0B' : '#EF4444'
    }));

    // 6. Area Chart Data (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyStats = await Application.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          apps: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Format dailyStats for frontend (ensuring all 7 days are present)
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      const found = dailyStats.find(s => s._id === dateStr);
      chartData.push({
        name: dayName,
        apps: found ? found.apps : 0
      });
    }

    // 7. Recent Activities
    const recentApplications = await Application.find()
      .populate('agentId', 'name')
      .populate('serviceId', 'title')
      .sort('-createdAt')
      .limit(5);

    const recentActivities = recentApplications.map(app => ({
      id: app._id,
      user: app.agentId ? app.agentId.name : 'Unknown Agent',
      action: 'submitted application for',
      target: app.serviceId ? app.serviceId.title : 'Deleted Service',
      time: app.createdAt,
      status: app.status === 'approved' ? 'Success' : app.status === 'pending' ? 'Pending' : 'Warning'
    }));

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalAgents,
          pendingAgents,
          totalEarnings,
          totalApplications
        },
        pieData,
        chartData,
        recentActivities
      }
    });
  } catch (err) {
    next(err);
  }
};
