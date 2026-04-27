const Settings = require('../models/Settings');

// Helper: get or create the singleton
const getOrCreate = async () => {
  let settings = await Settings.findOne({ key: 'portal' });
  if (!settings) {
    settings = await Settings.create({ key: 'portal' });
  }
  return settings;
};

// @desc    Get portal settings (public — agents need payment flags)
// @route   GET /api/settings
// @access  Private (any logged in user)
exports.getSettings = async (req, res) => {
  try {
    const settings = await getOrCreate();
    
    // Merge public keys from .env if they are empty in DB
    const settingsObj = settings.toObject();
    if (!settingsObj.razorpayKeyId) settingsObj.razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    if (!settingsObj.cashfreeAppId) settingsObj.cashfreeAppId = process.env.CASHFREE_APP_ID;

    res.status(200).json({ success: true, data: settingsObj });
  } catch (err) {
    next(err);
  }
};

// @desc    Update portal settings
// @route   PATCH /api/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
  try {
    const settings = await getOrCreate();

    const allowed = [
      'portalName', 'supportEmail', 'maintenanceMode', 'newRegistrations',
      'minTopup', 'maxTopup', 'onlinePaymentEnabled', 'offlinePaymentEnabled',
      'jwtExpiry', 'maxLoginAttempts', 'activityLogs',
      'emailNotifications', 'applicationAlerts', 'walletAlerts', 'smsNotifications',
      'agentRegistrationFee',
      'activePaymentGateway', 'razorpayKeyId', 'razorpayKeySecret',
      'cashfreeAppId', 'cashfreeSecretKey', 'cashfreeEnvironment'
    ];

    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });

    await settings.save();
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};
