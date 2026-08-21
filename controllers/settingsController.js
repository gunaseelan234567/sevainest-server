const Settings = require('../models/Settings');
const { uploadFile, getSignedDownloadUrl, generateS3Key } = require('../utils/s3Storage');

// Helper: get or create the singleton
const getOrCreate = async () => {
  let settings = await Settings.findOne({ key: 'portal' });
  if (!settings) {
    settings = await Settings.create({ key: 'portal' });
  }
  return settings;
};

// Helper: format settings object for response with signed URLs
const formatSettingsObj = async (settings) => {
  const settingsObj = settings.toObject();
  
  if (settings.categoryOrders) {
    settingsObj.categoryOrders = Object.fromEntries(settings.categoryOrders);
  }

  settingsObj.categoryImages = {};
  if (settings.categoryImageKeys) {
    for (const [catName, key] of settings.categoryImageKeys.entries()) {
      if (key) {
        try {
          settingsObj.categoryImages[catName] = await getSignedDownloadUrl(key, 900);
        } catch (err) {
          console.error(`Failed to sign S3 category image for ${catName}:`, err);
        }
      }
    }
  }
  
  if (!settingsObj.razorpayKeyId) settingsObj.razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  if (!settingsObj.cashfreeAppId) settingsObj.cashfreeAppId = process.env.CASHFREE_APP_ID;

  if (settingsObj.storage === 's3') {
    try {
      if (settingsObj.manualPaymentQRKey) {
        settingsObj.manualPaymentQR = await getSignedDownloadUrl(settingsObj.manualPaymentQRKey, 900);
      }
      if (settingsObj.welcomeImageKey) {
        settingsObj.welcomeImage = await getSignedDownloadUrl(settingsObj.welcomeImageKey, 900);
      }
    } catch (err) {
      console.error('Failed to sign S3 settings images:', err);
    }
  }

  return settingsObj;
};

// @desc    Get portal settings (public — agents need payment flags)
// @route   GET /api/settings
// @access  Private (any logged in user)
exports.getSettings = async (req, res, next) => {
  try {
    const settings = await getOrCreate();
    const settingsObj = await formatSettingsObj(settings);

    // Filter sensitive data if not admin
    if (!req.user || req.user.role !== 'admin') {
      delete settingsObj.razorpayKeySecret;
      delete settingsObj.cashfreeSecretKey;
    }

    res.status(200).json({ success: true, data: settingsObj });
  } catch (err) {
    next(err);
  }
};

// @desc    Update portal settings
// @route   PATCH /api/settings
// @access  Private/Admin
exports.updateSettings = async (req, res, next) => {
  try {
    const settings = await getOrCreate();

    const allowed = [
      'portalName', 'supportEmail', 'supportPhone', 'maintenanceMode', 'newRegistrations',
      'minTopup', 'maxTopup', 'onlinePaymentEnabled', 'offlinePaymentEnabled',
      'jwtExpiry', 'maxLoginAttempts', 'activityLogs',
      'emailNotifications', 'applicationAlerts', 'walletAlerts', 'smsNotifications',
      'agentRegistrationFee',
      'activePaymentGateway', 'razorpayKeyId', 'razorpayKeySecret',
      'cashfreeAppId', 'cashfreeSecretKey', 'cashfreeEnvironment',
      'manualPaymentQR', 'upiId', 'welcomeText', 'welcomeImage', 'categoryOrders'
    ];

    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'categoryOrders') {
          settings.set('categoryOrders', req.body.categoryOrders);
          settings.markModified('categoryOrders');
        } else {
          settings[field] = req.body[field];
        }
      }
    });

    if (req.files) {
      if (req.files.manualPaymentQR) {
        const uniqueKey = generateS3Key('settings', 'qr', req.files.manualPaymentQR[0].originalname);
        await uploadFile({
          buffer: req.files.manualPaymentQR[0].buffer,
          key: uniqueKey,
          contentType: req.files.manualPaymentQR[0].mimetype
        });
        settings.manualPaymentQR = `api/settings/qr`; // Placeholder fallback
        settings.manualPaymentQRKey = uniqueKey;
        settings.storage = 's3';
      }
      if (req.files.welcomeImage) {
        const uniqueKey = generateS3Key('settings', 'welcome', req.files.welcomeImage[0].originalname);
        await uploadFile({
          buffer: req.files.welcomeImage[0].buffer,
          key: uniqueKey,
          contentType: req.files.welcomeImage[0].mimetype
        });
        settings.welcomeImage = `api/settings/welcome`; // Placeholder fallback
        settings.welcomeImageKey = uniqueKey;
        settings.storage = 's3';
      }
    } else if (req.file) {
      // Fallback for single file upload
      const uniqueKey = generateS3Key('settings', 'qr', req.file.originalname);
      await uploadFile({
        buffer: req.file.buffer,
        key: uniqueKey,
        contentType: req.file.mimetype
      });
      settings.manualPaymentQR = `api/settings/qr`; // Placeholder fallback
      settings.manualPaymentQRKey = uniqueKey;
      settings.storage = 's3';
    }

    await settings.save();
    const settingsObj = await formatSettingsObj(settings);
    res.status(200).json({ success: true, data: settingsObj });
  } catch (err) {
    next(err);
  }
};

// @desc    Upload Category Image
// @route   POST /api/settings/category-image
// @access  Private/Admin
exports.uploadCategoryImage = async (req, res, next) => {
  try {
    const { categoryName } = req.body;
    if (!categoryName) {
      return res.status(400).json({ message: 'Category name is required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image file' });
    }

    const settings = await getOrCreate();
    const sanitizedCat = categoryName.replace(/[^a-zA-Z0-9]/g, '_');
    const uniqueKey = generateS3Key('settings/categories', sanitizedCat, req.file.originalname);

    await uploadFile({
      buffer: req.file.buffer,
      key: uniqueKey,
      contentType: req.file.mimetype
    });

    settings.set(`categoryImageKeys.${categoryName}`, uniqueKey);
    settings.markModified('categoryImageKeys');
    await settings.save();

    const signedUrl = await getSignedDownloadUrl(uniqueKey, 900);

    res.status(200).json({
      success: true,
      imageUrl: signedUrl,
      categoryName
    });
  } catch (err) {
    next(err);
  }
};
