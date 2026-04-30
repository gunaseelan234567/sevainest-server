const User = require('../models/User');
const Settings = require('../models/Settings');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const sendEmail = require('../utils/sendEmail');

// Helper for Cashfree Headers
const getCashfreeHeaders = (settings) => ({
  'x-client-id': settings.cashfreeAppId || process.env.CASHFREE_APP_ID,
  'x-client-secret': settings.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY,
  'x-api-version': '2022-09-01',
  'Content-Type': 'application/json'
});

const getCashfreeUrl = (settings) => {
  const appId = settings.cashfreeAppId || process.env.CASHFREE_APP_ID;
  const secretKey = settings.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY;
  
  if (appId?.includes('prod') || secretKey?.includes('prod')) {
    return 'https://api.cashfree.com/pg';
  }

  if (appId?.includes('TEST') || secretKey?.includes('test')) {
    return 'https://sandbox.cashfree.com/pg';
  }

  const env = settings.cashfreeEnvironment || 'sandbox';
  return env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
};

// Helper to generate unique Agent ID
const generateAgentId = async () => {
  const lastUser = await User.findOne({ agentId: { $ne: null } }).sort({ createdAt: -1 });
  let nextId = 1001;
  if (lastUser && lastUser.agentId) {
    const lastNum = parseInt(lastUser.agentId.split('-')[1]);
    nextId = lastNum + 1;
  }
  return `AGT-${nextId}`;
};

// @desc    Register user (Admin created)
// @route   POST /api/auth/register
// @access  Private/Admin
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone, shopAddress } = req.body;

    // Create user (Admins are pre-activated)
    const user = await User.create({
      name,
      email,
      password,
      role: role || 'agent',
      phone,
      shopAddress,
      isActivated: true,
      status: 'active',
      agentId: role === 'agent' ? await generateAgentId() : undefined
    });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Register Agent (Self registration with payment)
// @route   POST /api/auth/register-agent
// @access  Public
exports.registerAgent = async (req, res, next) => {
  try {
    const { name, email, password, paymentMode, phone, shopAddress } = req.body;

    const portalSettings = await Settings.findOne({ key: 'portal' });
    const registrationFee = portalSettings?.agentRegistrationFee || 100;

    // Create user in pending state
    const user = await User.create({
      name,
      email,
      password,
      phone,
      shopAddress,
      role: 'agent',
      paymentMode,
      paymentStatus: paymentMode === 'online' ? 'pending' : 'unpaid',
      status: 'pending',
      isActivated: false
    });

    if (paymentMode === 'online') {
      const orderData = {
        order_amount: registrationFee,
        order_currency: "INR",
        order_id: `reg_${user._id}_${Date.now()}`,
        customer_details: {
          customer_id: String(user._id),
          customer_email: user.email,
          customer_phone: req.body.phone || "9999999999"
        },
        order_meta: {
          return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?order_id={order_id}&user_id=${user._id}`
        }
      };

      const response = await axios.post(
        `${getCashfreeUrl(portalSettings)}/orders`,
        orderData,
        { headers: getCashfreeHeaders(portalSettings) }
      );

      user.registrationOrderId = response.data.order_id;
      await user.save();

      return res.status(201).json({
        success: true,
        data: {
          user: { id: user._id, name: user.name, email: user.email },
          order: response.data,
          fee: registrationFee
        }
      });
    }

    // Offline mode
    try {
      await sendEmail({
        email: user.email,
        subject: 'Welcome to Sevainest - Account Pending Approval',
        message: `Hello ${user.name},\n\nThank you for registering as an agent with Sevainest. Your account is currently under approval. Once activated, you will receive another email with your Agent ID.\n\nRegistration Fee: ₹${registrationFee}\n\nBest regards,\nSevainest Team`,
      });
    } catch (err) {
      console.error('Email could not be sent');
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Your account is under approval.',
      data: { user: { id: user._id, name: user.name, email: user.email }, fee: registrationFee }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Registration Payment (Cashfree)
// @route   POST /api/auth/verify-registration
// @access  Public
exports.verifyRegistrationPayment = async (req, res) => {
  try {
    const { order_id } = req.body;
    console.log('Verifying Registration Payment:', order_id);
    const settings = await Settings.findOne({ key: 'portal' });

    const response = await axios.get(
      `${getCashfreeUrl(settings)}/orders/${order_id}`,
      { headers: getCashfreeHeaders(settings) }
    );

    console.log('Cashfree Status Response:', response.data.order_status);

    if (response.data.order_status === 'PAID') {
      const user = await User.findOne({ registrationOrderId: order_id });
      if (!user) {
        console.log('User not found for registration ID:', order_id);
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.status === 'active') {
        console.log('User already active:', user.email);
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
          expiresIn: process.env.JWT_EXPIRE || '30d'
        });
        return res.status(200).json({ 
          success: true, 
          message: 'Already activated',
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            agentId: user.agentId,
            isActivated: user.isActivated,
            walletBalance: user.walletBalance
          }
        });
      }

      // Instant Activation
      user.paymentStatus = 'paid';
      user.isPaid = true;
      user.isActivated = true;
      user.status = 'active';
      
      // Generate Agent ID if not exists
      if (!user.agentId) {
        user.agentId = await generateAgentId();
      }
      
      await user.save();

      console.log('User Activated Instantly:', user.email, 'Agent ID:', user.agentId);

      // Generate Token for auto-login
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '30d'
      });

      // Send Welcome Email with Agent ID
      try {
        await sendEmail({
          email: user.email,
          subject: 'Your Sevainest Account is Now Active!',
          message: `Welcome ${user.name}!\n\nYour registration fee payment was successful. Your account has been activated instantly.\n\nYour Agent ID: ${user.agentId}\n\nYou can now start using our services.\n\nBest regards,\nSevainest Team`,
        });
      } catch (err) {}

      res.status(200).json({ 
        success: true, 
        message: 'Account activated', 
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          agentId: user.agentId,
          isActivated: user.isActivated,
          walletBalance: user.walletBalance
        }
      });
    } else {
      console.log('Payment not PAID. Current status:', response.data.order_status);
      res.status(400).json({ message: `Payment not completed. Status: ${response.data.order_status}` });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Activate Agent (Admin only for offline/pending agents)
// @route   PATCH /api/auth/activate/:id
// @access  Private/Admin
exports.activateAgent = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isActivated = true;
    user.status = 'active';
    user.paymentStatus = 'paid'; // Admin manually verified offline payment
    user.agentId = await generateAgentId();
    await user.save();

    // Send activation email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Your Sevainest Account is Now Active!',
        message: `Hello ${user.name},\n\nCongratulations! Your Sevainest agent account has been activated.\n\nYour Agent ID: ${user.agentId}\n\nYou can now log in and start using our services.\n\nBest regards,\nSevainest Team`,
      });
    } catch (err) {
      console.error('Activation email could not be sent');
    }

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide an email and password' });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if account is activated
    if (!user.isActivated && user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Account not yet activated. Please contact admin or complete payment.',
        status: user.status,
        paymentStatus: user.paymentStatus
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all users (Admin only)
// @route   GET /api/auth/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  try {
    const { status, role } = req.query;
    let query = {};
    if (status) query.status = status;
    if (role) query.role = role;

    const users = await User.find(query).select('-password').sort('-createdAt');
    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Log user out / clear cookie
// @route   GET /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  res.status(200).json({
    success: true,
    data: {},
  });
};

// @desc    Forgot Password - Send OTP
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Save to user
    user.resetPasswordOTP = otp;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset OTP - Sevainest',
        message: `Your OTP for password reset is: ${otp}\n\nThis OTP is valid for 10 minutes. If you did not request this, please ignore this email.`,
      });
      res.status(200).json({ success: true, message: 'OTP sent to email' });
    } catch (err) {
      user.resetPasswordOTP = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      res.status(500).json({ message: 'Email could not be sent' });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Reset Password
// @route   POST /api/auth/resetpassword
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    const user = await User.findOne({
      email,
      resetPasswordOTP: otp,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Set new password
    user.password = password;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
};

// @desc    Send bulk email to selected agents
// @route   POST /api/auth/bulk-email
// @access  Private/Admin
exports.bulkEmail = async (req, res, next) => {
  try {
    const { userIds, subject, message } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'Please select at least one agent' });
    }

    if (!subject || !message) {
      return res.status(400).json({ message: 'Please provide subject and message' });
    }

    const users = await User.find({ _id: { $in: userIds } });

    // Send emails in parallel
    const emailPromises = users.map(user => 
      sendEmail({
        email: user.email,
        subject: subject,
        message: `Hello ${user.name},\n\n${message}\n\nBest regards,\nSevainest Admin Team`
      })
    );

    await Promise.all(emailPromises);

    res.status(200).json({
      success: true,
      message: `Emails sent successfully to ${users.length} agents`
    });
  } catch (err) {
    next(err);
  }
};

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });

  const options = {
    expires: new Date(
      Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        agentId: user.agentId,
        isActivated: user.isActivated,
        walletBalance: user.walletBalance
      }
    });
};
