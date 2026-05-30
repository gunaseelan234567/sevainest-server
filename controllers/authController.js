const User = require('../models/User');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const sendEmail = require('../utils/sendEmail');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();
const hashOtp = (otp) => crypto
  .createHash('sha256')
  .update(`${otp}:${process.env.JWT_SECRET}`)
  .digest('hex');
const isOtpMatch = (plainOtp, storedHash) => {
  if (!plainOtp || !storedHash) return false;
  const incomingHash = hashOtp(plainOtp);
  const incoming = Buffer.from(incomingHash);
  const stored = Buffer.from(storedHash);
  return incoming.length === stored.length && crypto.timingSafeEqual(incoming, stored);
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  try {
    // 1. Find the highest existing numeric ID in AGT-XXXX format
    // We fetch all to handle potential gaps or non-sequential legacy data
    const users = await User.find({ 
      agentId: { $regex: /^AGT-\d+$/ } 
    }).select('agentId').lean();

    let maxId = 1000; // Starting base
    
    if (users && users.length > 0) {
      users.forEach(u => {
        const match = u.agentId.match(/AGT-(\d+)/);
        if (match) {
          const num = parseInt(match[1]);
          if (!isNaN(num) && num > maxId) {
            maxId = num;
          }
        }
      });
    }

    // 2. Propose new ID and verify it's truly unique
    let nextNum = maxId + 1;
    let finalId = `AGT-${nextNum}`;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const existing = await User.findOne({ agentId: finalId });
      if (!existing) {
        isUnique = true;
      } else {
        nextNum++;
        finalId = `AGT-${nextNum}`;
        attempts++;
      }
    }

    console.log(`🎫 Generated Unique Agent ID: ${finalId}`);
    return finalId;
  } catch (err) {
    console.error('❌ Error generating Agent ID:', err);
    return `AGT-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 99)}`;
  }
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
    const registrationFee = portalSettings?.agentRegistrationFee || 0;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    // Create user in pending state
    const user = await User.create({
      name,
      email,
      password,
      phone,
      shopAddress,
      role: 'agent',
      paymentMode: registrationFee === 0 ? 'free' : paymentMode,
      paymentStatus: registrationFee === 0 ? 'paid' : (paymentMode === 'online' ? 'pending' : 'unpaid'),
      status: 'pending',
      isActivated: false,
      isPaid: registrationFee === 0
    });

    if (registrationFee > 0 && paymentMode === 'online') {
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

    // Offline or Free mode
    try {
      await sendEmail({
        email: user.email,
        subject: registrationFee === 0 ? 'Welcome to Sevainest - Registration Successful' : 'Welcome to Sevainest - Account Pending Approval',
        message: registrationFee === 0 
          ? `Hello ${user.name},\n\nThank you for registering as an agent with Sevainest. Your registration was successful and completely free.\n\nYour account is currently under approval by our admin team. Once activated, you will receive another email with your Agent ID.\n\nBest regards,\nSevainest Team`
          : `Hello ${user.name},\n\nThank you for registering as an agent with Sevainest. Your account is currently under approval. Once activated, you will receive another email with your Agent ID.\n\nRegistration Fee: ₹${registrationFee}\n\nBest regards,\nSevainest Team`,
      });
    } catch (err) {
      console.error('Email could not be sent');
    }

    res.status(201).json({
      success: true,
      message: registrationFee === 0 ? 'Registration successful. Free account is under approval.' : 'Registration successful. Your account is under approval.',
      data: { user: { id: user._id, name: user.name, email: user.email }, fee: registrationFee }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Registration Payment (Cashfree)
// @route   POST /api/auth/verify-registration
// @access  Public
exports.verifyRegistrationPayment = async (req, res, next) => {
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
      const user = await User.findOne({ registrationOrderId: order_id }).select('+password');
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
exports.activateAgent = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.status === 'active' && user.agentId) {
      return res.status(200).json({ success: true, message: 'Agent is already active', data: user });
    }

    console.log(`👤 Activating agent: ${user.email} (Current Status: ${user.status})`);

    let activated = false;
    let attempts = 0;

    while (!activated && attempts < 3) {
      attempts++;
      
      // Only generate ID if they don't have one
      if (!user.agentId) {
        user.agentId = await generateAgentId();
      }

      user.isActivated = true;
      user.status = 'active';
      user.paymentStatus = 'paid';

      try {
        await user.save();
        activated = true;
      } catch (saveErr) {
        console.error(`❌ Activation Attempt ${attempts} failed:`, saveErr.message);
        
        if (saveErr.code === 11000) {
          const field = Object.keys(saveErr.keyPattern || {})[0];
          if (field === 'agentId') {
            console.log(`🔄 Retrying with a new ID due to collision on ${user.agentId}...`);
            user.agentId = undefined; // Force re-generation in next loop
            continue;
          }
          return res.status(400).json({ 
            message: `Activation failed: Duplicate ${field} detected. This account might already be active.` 
          });
        }
        
        throw saveErr; // Rethrow other errors
      }
    }

    if (!activated) {
      return res.status(500).json({ message: 'Failed to activate agent after multiple attempts due to ID collisions.' });
    }

    console.log(`✅ Agent ${user.email} activated successfully with ID ${user.agentId}`);

    // Send activation email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Your Sevainest Account is Now Active!',
        message: `Hello ${user.name},\n\nCongratulations! Your Sevainest agent account has been activated.\n\nYour Agent ID: ${user.agentId}\n\nYou can now log in and start using our services.\n\nBest regards,\nSevainest Team`,
      });
    } catch (err) {
      console.error('❌ Activation email could not be sent:', err.message);
    }

    res.status(200).json({ success: true, message: 'Agent activated successfully', data: user });
  } catch (err) {
    console.error('❌ Failed to activate agent:', err);
    next(err);
  }
};

// @desc    Reject Agent (Admin only)
// @route   PATCH /api/auth/reject/:id
// @access  Private/Admin
exports.rejectAgent = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.status = 'rejected';
    await user.save();

    // Send rejection email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Agent Application Status - Sevainest',
        message: `Hello ${user.name},\n\nWe regret to inform you that your application for a Sevainest agent account has been declined at this time.\n\nIf you have any questions, please contact our support team.\n\nBest regards,\nSevainest Team`,
      });
    } catch (err) {
      console.error('❌ Rejection email could not be sent:', err.message);
    }

    res.status(200).json({ success: true, message: 'Agent rejected successfully' });
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
    const user = await User.findOne({ email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') } }).select('+password');

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

    if (user.isTwoFactorEnabled) {
      return res.status(200).json({
        success: true,
        requires2FA: true,
        userId: user._id
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
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    console.log(`🔍 Forgot password request for: ${email}`);
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } }).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate 6-digit OTP
    const otp = generateOtp();
    
    // Save to user
    user.resetPasswordOTP = hashOtp(otp);
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
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, password } = req.body;
    console.log(`Password reset attempt for: ${email}`);

    const user = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user || !isOtpMatch(otp, user.resetPasswordOTP)) {
      console.log(`Password reset failed for ${email}`);
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

// @desc    Send Email Verification Code
// @route   POST /api/auth/send-verification
// @access  Private
exports.sendVerificationCode = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate 6-digit OTP
    const otp = generateOtp();
    console.log(`Generated email verification OTP for user: ${user.email}`);
    user.emailVerificationOTP = hashOtp(otp);
    user.emailVerificationOTPExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    console.log(`💾 Saving user with OTP...`);
    await user.save();
    console.log(`✅ User saved successfully`);

    // Send email
    try {
      console.log(`Sending verification OTP to ${user.email}`);
      await sendEmail({
        email: user.email,
        subject: 'Verify Your Sevainest Account',
        message: `Welcome to the New Sevainest!\n\nYour verification code is: ${otp}\n\nPlease enter this code to verify your account and start using our services.\n\nBest regards,\nSevainest Team`,
      });
      res.status(200).json({ success: true, message: 'Verification code sent to email' });
    } catch (err) {
      console.error(`❌ Email delivery failed: ${err.message}`);
      user.emailVerificationOTP = undefined;
      user.emailVerificationOTPExpire = undefined;
      await user.save();
      res.status(500).json({ message: `Email could not be sent: ${err.message}` });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Email with OTP
// @route   POST /api/auth/verify-email
// @access  Private
exports.verifyEmail = async (req, res, next) => {
  try {
    const { otp } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.emailVerificationOTP || user.emailVerificationOTPExpire < Date.now() || !isOtpMatch(otp, user.emailVerificationOTP)) {
      // Allow '000000' as a bypass in development mode
      if (false) {
        console.log(`⚠️ Development Bypass used for ${user.email}`);
      } else {
        return res.status(400).json({ message: 'Invalid or expired verification code' });
      }
    }

    user.isEmailVerified = true;
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
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

// @desc    Setup 2FA
// @route   POST /api/auth/setup-2fa
// @access  Private
exports.setup2FA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const secret = speakeasy.generateSecret({
      name: `Sevainest (${user.email})`
    });

    user.twoFactorSecret = secret.base32;
    await user.save();

    const dataURL = await QRCode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      success: true,
      secret: secret.base32,
      qrCode: dataURL
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify and Enable 2FA
// @route   POST /api/auth/verify-2fa
// @access  Private
exports.verify2FA = async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id);

    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ message: '2FA setup not initialized' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });

    if (verified) {
      user.isTwoFactorEnabled = true;
      await user.save();
      return res.status(200).json({ success: true, message: '2FA enabled successfully' });
    } else {
      return res.status(400).json({ message: 'Invalid 2FA token' });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Disable 2FA
// @route   POST /api/auth/disable-2fa
// @access  Private
exports.disable2FA = async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.isTwoFactorEnabled) {
       return res.status(400).json({ message: '2FA is already disabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });

    if (verified) {
      user.isTwoFactorEnabled = false;
      user.twoFactorSecret = undefined;
      await user.save();
      return res.status(200).json({ success: true, message: '2FA disabled successfully' });
    } else {
      return res.status(400).json({ message: 'Invalid 2FA token' });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Login with 2FA
// @route   POST /api/auth/login-2fa
// @access  Public
exports.login2FA = async (req, res, next) => {
  try {
    const { userId, token } = req.body;
    if (!userId || !token) return res.status(400).json({ message: 'Please provide user ID and token' });

    const user = await User.findById(userId);
    if (!user || !user.isTwoFactorEnabled) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });

    if (!verified) {
      return res.status(401).json({ message: 'Invalid 2FA token' });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Delete user (Soft delete with password confirmation & logging)
// @route   DELETE /api/auth/user/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    // Release unique constraints so the email/agentId can be registered again in the future
    user.email = `deleted_${Date.now()}_${user.email}`;
    if (user.agentId) {
      user.agentId = `deleted_${Date.now()}_${user.agentId}`;
    }
    await user.save();

    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role,
      actionType: 'delete',
      targetCollection: 'users',
      targetId: String(user._id),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'success' }
    });

    console.log(`[AUDIT] ADMIN_DELETE_USER SUCCESS: ID: ${user._id} by Admin: ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'User soft-deleted successfully'
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore user (Admins only)
// @route   PATCH /api/auth/user/:id/restore
// @access  Private/Admin
exports.restoreUser = async (req, res, next) => {
  try {
    // Specifically search with isDeleted: true to locate soft-deleted record
    const user = await User.findOne({ _id: req.params.id, isDeleted: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Soft-deleted user not found' });
    }

    user.isDeleted = false;
    user.deletedAt = null;
    await user.save();

    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role,
      actionType: 'update',
      targetCollection: 'users',
      targetId: String(user._id),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'restore_success' }
    });

    console.log(`[AUDIT] ADMIN_RESTORE_USER SUCCESS: ID: ${user._id} by Admin: ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'User restored successfully',
      data: user
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
        isEmailVerified: user.isEmailVerified,
        walletBalance: user.walletBalance
      }
    });
};

// @desc    Verify critical action password and issue a short-lived token
// @route   POST /api/auth/verify-critical-action
// @access  Private/Admin
exports.verifyCriticalAction = async (req, res, next) => {
  try {
    const { password, actionType } = req.body;
    
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    // Generate action token valid for 2 minutes
    const token = jwt.sign(
      { 
        id: user._id, 
        isCriticalActionVerified: true, 
        actionType 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '2m' }
    );

    res.status(200).json({
      success: true,
      token
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update user dynamic permissions (Super Admin only)
// @route   PUT /api/auth/users/:id/permissions
// @access  Private/Admin
exports.updateUserPermissions = async (req, res, next) => {
  try {
    const { permissions } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { logAdminAction } = require('../utils/auditLogger');
    const oldPermissions = [...(user.permissions || [])];

    user.permissions = permissions || [];
    await user.save();

    // Audit action
    await logAdminAction({
      adminId: req.user._id,
      role: req.user.role,
      actionType: 'update',
      targetCollection: 'users',
      targetId: user._id.toString(),
      oldData: { permissions: oldPermissions },
      newData: { permissions: user.permissions },
      req
    });

    res.status(200).json({
      success: true,
      message: 'User permissions updated successfully',
      data: user
    });
  } catch (err) {
    next(err);
  }
};

