const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const FundRequest = require('../models/FundRequest');
const axios = require('axios');
const sendEmail = require('../utils/sendEmail');
const Settings = require('../models/Settings');

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
  
  // 1. Force Production if keys contain 'prod'
  if (appId?.includes('prod') || secretKey?.includes('prod')) {
    return 'https://api.cashfree.com/pg';
  }

  // 2. Force Sandbox if keys contain 'test'
  if (appId?.includes('TEST') || secretKey?.includes('test')) {
    return 'https://sandbox.cashfree.com/pg';
  }

  // 3. Fallback to settings or default
  const env = settings.cashfreeEnvironment || 'sandbox';
  return env === 'production' 
    ? 'https://api.cashfree.com/pg' 
    : 'https://sandbox.cashfree.com/pg';
};

// @desc    Get wallet balance and history
// @route   GET /api/wallet/history
// @access  Private/Agent
exports.getWalletHistory = async (req, res) => {
  try {
    const transactions = await WalletTransaction.find({ agentId: req.user.id }).sort('-createdAt');
    const user = await User.findById(req.user.id).select('walletBalance');
    
    res.status(200).json({
      success: true,
      balance: user.walletBalance,
      data: transactions
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Admin: Add funds to user wallet
// @route   POST /api/wallet/admin/add-funds
// @access  Private/Admin
exports.adminAddFunds = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.walletBalance += Number(amount);
    await user.save();

    // Log Transaction
    await WalletTransaction.create({
      agentId: user._id,
      type: 'credit',
      amount,
      reason: reason || 'Funds added by Admin',
      performedBy: req.user.id,
      balanceAfter: user.walletBalance
    });

    res.status(200).json({
      success: true,
      message: `₹${amount} added to ${user.name}'s wallet`,
      newBalance: user.walletBalance
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Admin: Deduct funds from user wallet
// @route   POST /api/wallet/admin/deduct-funds
// @access  Private/Admin
exports.adminDeductFunds = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.walletBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance for deduction' });
    }

    user.walletBalance -= Number(amount);
    await user.save();

    // Log Transaction
    await WalletTransaction.create({
      agentId: user._id,
      type: 'debit',
      amount,
      reason: reason || 'Funds deducted by Admin',
      performedBy: req.user.id,
      balanceAfter: user.walletBalance
    });

    res.status(200).json({
      success: true,
      message: `₹${amount} deducted from ${user.name}'s wallet`,
      newBalance: user.walletBalance
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create Online Payment Order (Cashfree)
// @route   POST /api/wallet/online-order
// @access  Private/Agent
exports.createOnlineOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const settings = await Settings.findOne({ key: 'portal' });

    // Cashfree Logic
    const orderData = {
      order_amount: amount,
      order_currency: "INR",
      order_id: `order_${Date.now()}`,
      customer_details: {
        customer_id: String(req.user.id),
        customer_email: req.user.email,
        customer_phone: req.user.phone || "9999999999"
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/agent/wallet?order_id={order_id}`
      }
    };

    const response = await axios.post(
      `${getCashfreeUrl(settings)}/orders`,
      orderData,
      { headers: getCashfreeHeaders(settings) }
    );

    console.log('Cashfree Order Created:', response.data);

    await FundRequest.create({
      agentId: req.user.id,
      amount: Number(amount),
      method: 'online',
      transactionId: response.data.order_id,
      status: 'pending'
    });

    res.status(200).json({ 
      success: true, 
      gateway: 'cashfree', 
      order: response.data 
    });
  } catch (err) {
    console.error('Order creation failed:', err.response?.data || err.message);
    res.status(400).json({ message: err.response?.data?.message || err.message });
  }
};

// @desc    Verify Cashfree Payment
// @route   POST /api/wallet/cashfree/verify
// @access  Private/Agent
exports.verifyCashfreePayment = async (req, res) => {
  try {
    const { order_id } = req.body;
    console.log('Verifying Cashfree Order:', order_id);
    const settings = await Settings.findOne({ key: 'portal' });

    const response = await axios.get(
      `${getCashfreeUrl(settings)}/orders/${order_id}`,
      { headers: getCashfreeHeaders(settings) }
    );

    console.log('Cashfree Status Response:', response.data.order_status);

    if (response.data.order_status === 'PAID') {
      console.log('Order is PAID. Searching for FundRequest with transactionId:', order_id);
      
      // Log all pending requests for this user to help debug
      const allPending = await FundRequest.find({ agentId: req.user.id, status: 'pending' });
      console.log('User Pending Requests:', allPending.map(r => ({ id: r._id, txId: r.transactionId })));

      // Use findOneAndUpdate to atomically lock the request and prevent double-processing
      let fundRequest = await FundRequest.findOneAndUpdate(
        { transactionId: order_id, status: 'pending' },
        { 
          $set: { 
            status: 'approved', 
            processedAt: Date.now() 
          } 
        },
        { new: true }
      );
      
      if (!fundRequest) {
        // Check if it was already processed
        const alreadyDone = await FundRequest.findOne({ transactionId: order_id, status: 'approved' });
        if (alreadyDone) {
          console.log('FundRequest already processed. Skipping balance update.');
          return res.status(200).json({ success: true, message: 'Already processed' });
        }
        
        console.log('EXACT MATCH FAILED or already processed. Trying fuzzy match for pending...');
        fundRequest = await FundRequest.findOneAndUpdate(
          { transactionId: { $regex: order_id, $options: 'i' }, status: 'pending' },
          { 
            $set: { 
              status: 'approved', 
              processedAt: Date.now() 
            } 
          },
          { new: true }
        );
      }

      if (!fundRequest) {
        console.log('FundRequest not found or already processed for ID:', order_id);
        return res.status(400).json({ message: 'Transaction record not found or already processed' });
      }

      const user = await User.findById(fundRequest.agentId);
      user.walletBalance = (user.walletBalance || 0) + Number(fundRequest.amount);
      await user.save();

      await WalletTransaction.create({
        agentId: user._id,
        type: 'credit',
        amount: Number(fundRequest.amount),
        reason: 'Online Wallet Topup (Cashfree)',
        performedBy: user._id,
        balanceAfter: user.walletBalance
      });

      console.log('Wallet updated for order:', order_id);

      try {
        await sendEmail({
          email: user.email,
          subject: 'Wallet Recharge Successful',
          message: `Hello ${user.name},\n\nYour wallet has been recharged via Cashfree.\n\nAmount: ₹${fundRequest.amount}\nOrder ID: ${order_id}\nNew Balance: ₹${user.walletBalance}`,
        });
      } catch (err) {}

      res.status(200).json({ success: true, message: 'Payment verified' });
    } else {
      console.log('Payment not PAID. Current status:', response.data.order_status);
      res.status(400).json({ message: `Payment status: ${response.data.order_status}` });
    }
  } catch (err) {
    console.error('Verification Error:', err.response?.data || err.message);
    res.status(400).json({ message: err.response?.data?.message || err.message });
  }
};

// @desc    Submit Offline Fund Request
// @route   POST /api/wallet/request/offline
// @access  Private/Agent
exports.submitOfflineRequest = async (req, res) => {
  try {
    const { amount, transactionId } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a payment proof' });
    }

    const fundRequest = await FundRequest.create({
      agentId: req.user.id,
      amount,
      method: 'offline',
      status: 'pending',
      transactionId,
      proofImage: `/uploads/proofs/${req.file.filename}`
    });

    res.status(201).json({ success: true, data: fundRequest });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all fund requests (Admin or Agent)
// @route   GET /api/wallet/requests
// @access  Private
exports.getFundRequests = async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'admin') {
      query.agentId = req.user.id;
    }

    const requests = await FundRequest.find(query)
      .populate('agentId', 'name email')
      .populate('processedBy', 'name')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    next(err);
  }
};

// @desc    Update Fund Request Status (Admin)
// @route   PATCH /api/wallet/requests/:id
// @access  Private/Admin
exports.updateFundRequestStatus = async (req, res) => {
  try {
    const { status, adminRemark } = req.body;
    const request = await FundRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    request.status = status;
    request.adminRemark = adminRemark;
    request.processedBy = req.user.id;
    request.processedAt = Date.now();

    if (status === 'approved') {
      const user = await User.findById(request.agentId);
      user.walletBalance += request.amount;
      await user.save();

      // Log Transaction
      await WalletTransaction.create({
        agentId: user._id,
        type: 'credit',
        amount: request.amount,
        reason: 'Offline Wallet Topup (Admin Approved)',
        performedBy: req.user.id,
        balanceAfter: user.walletBalance
      });
    }

    await request.save();

    // Send email notification
    try {
      const user = await User.findById(request.agentId);
      if (user) {
        await sendEmail({
          email: user.email,
          subject: `Wallet Recharge Request: ${status.toUpperCase()}`,
          message: `Hello ${user.name},\n\nYour offline wallet recharge request has been ${status}.\n\nAmount: ₹${request.amount}\nStatus: ${status.toUpperCase()}\nRemark: ${adminRemark || 'None'}\n${status === 'approved' ? `New Balance: ₹${user.walletBalance}` : ''}\n\nPlease log in to your dashboard for details.\n\nBest regards,\nSevainest Team`,
        });
      }
    } catch (err) {
      console.error('Offline recharge status email could not be sent');
    }

    res.status(200).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
};
