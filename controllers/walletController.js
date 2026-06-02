const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const FundRequest = require('../models/FundRequest');
const axios = require('axios');
const sendEmail = require('../utils/sendEmail');
const Settings = require('../models/Settings');
const mongoose = require('mongoose');
const { uploadToSupabase } = require('../utils/supabaseStorage');
const { createNotification } = require('./notificationController');
const logger = require('../utils/logger');

const getCashfreeHeaders = (settings = {}) => ({
  'x-client-id': settings.cashfreeAppId || process.env.CASHFREE_APP_ID,
  'x-client-secret': settings.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY,
  'x-api-version': '2022-09-01',
  'Content-Type': 'application/json'
});

const getCashfreeUrl = (settings = {}) => {
  const appId = settings.cashfreeAppId || process.env.CASHFREE_APP_ID;
  const secretKey = settings.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY;

  if (appId?.includes('prod') || secretKey?.includes('prod')) {
    return 'https://api.cashfree.com/pg';
  }

  if (appId?.includes('TEST') || secretKey?.includes('test')) {
    return 'https://sandbox.cashfree.com/pg';
  }

  return settings.cashfreeEnvironment === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
};

const parsePositiveAmount = (amount, minimum = 0) => {
  const value = Number(amount);
  return Number.isFinite(value) && value > 0 && value >= minimum ? value : null;
};

exports.getWalletHistory = async (req, res, next) => {
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

exports.adminAddFunds = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { userId, reason } = req.body;
    const amount = parsePositiveAmount(req.body.amount);

    if (!amount) {
      return res.status(400).json({ message: 'Please provide a valid positive amount' });
    }

    let user;

    try {
      await session.withTransaction(async () => {
        user = await User.findByIdAndUpdate(
          userId,
          { $inc: { walletBalance: amount } },
          { new: true, session }
        );

        if (!user) {
          throw Object.assign(new Error('User not found'), { statusCode: 404 });
        }

        await WalletTransaction.create([{
          agentId: user._id,
          type: 'credit',
          amount,
          reason: reason || 'Funds added by Admin',
          performedBy: req.user.id,
          balanceAfter: user.walletBalance
        }], { session });
      });
    } catch (err) {
      if (err.message?.includes('replica set') || err.message?.includes('Transaction numbers')) {
        // Fallback for standalone MongoDB (No Transaction Support)
        user = await User.findByIdAndUpdate(
          userId,
          { $inc: { walletBalance: amount } },
          { new: true }
        );

        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        await WalletTransaction.create([{
          agentId: user._id,
          type: 'credit',
          amount,
          reason: reason || 'Funds added by Admin',
          performedBy: req.user.id,
          balanceAfter: user.walletBalance
        }]);
      } else {
        throw err;
      }
    }

    await createNotification({
      userId: user._id,
      title: 'Wallet Credited',
      message: `Rs.${amount} has been added to your wallet by admin.`,
      type: 'wallet_approved'
    });

    res.status(200).json({
      success: true,
      message: `Rs.${amount} added to ${user.name}'s wallet`,
      newBalance: user.walletBalance
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    next(err);
  } finally {
    session.endSession();
  }
};

exports.adminDeductFunds = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { userId, reason } = req.body;
    const amount = parsePositiveAmount(req.body.amount);

    if (!amount) {
      return res.status(400).json({ message: 'Please provide a valid positive amount' });
    }

    let user;

    try {
      await session.withTransaction(async () => {
        user = await User.findOneAndUpdate(
          { _id: userId, walletBalance: { $gte: amount } },
          { $inc: { walletBalance: -amount } },
          { new: true, session }
        );

        if (!user) {
          throw Object.assign(new Error('User not found or insufficient balance for deduction'), { statusCode: 400 });
        }

        await WalletTransaction.create([{
          agentId: user._id,
          type: 'debit',
          amount,
          reason: reason || 'Funds deducted by Admin',
          performedBy: req.user.id,
          balanceAfter: user.walletBalance
        }], { session });
      });
    } catch (err) {
      if (err.message?.includes('replica set') || err.message?.includes('Transaction numbers')) {
        // Fallback for standalone MongoDB (No Transaction Support)
        user = await User.findOneAndUpdate(
          { _id: userId, walletBalance: { $gte: amount } },
          { $inc: { walletBalance: -amount } },
          { new: true }
        );

        if (!user) {
          return res.status(400).json({ message: 'User not found or insufficient balance for deduction' });
        }

        await WalletTransaction.create([{
          agentId: user._id,
          type: 'debit',
          amount,
          reason: reason || 'Funds deducted by Admin',
          performedBy: req.user.id,
          balanceAfter: user.walletBalance
        }]);
      } else {
        throw err;
      }
    }

    await createNotification({
      userId: user._id,
      title: 'Wallet Debited',
      message: `Rs.${amount} has been deducted from your wallet by admin. Reason: ${reason || 'Admin adjustment'}.`,
      type: 'wallet_approved'
    });

    res.status(200).json({
      success: true,
      message: `Rs.${amount} deducted from ${user.name}'s wallet`,
      newBalance: user.walletBalance
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    next(err);
  } finally {
    session.endSession();
  }
};

exports.createOnlineOrder = async (req, res) => {
  try {
    const amount = parsePositiveAmount(req.body.amount, 50);
    if (!amount) {
      return res.status(400).json({ message: 'Minimum wallet load amount is Rs.50' });
    }

    const settings = await Settings.findOne({ key: 'portal' });
    const orderData = {
      order_amount: amount,
      order_currency: 'INR',
      order_id: `order_${req.user.id}_${Date.now()}`,
      customer_details: {
        customer_id: String(req.user.id),
        customer_email: req.user.email,
        customer_phone: req.user.phone || '9999999999'
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

    await FundRequest.create({
      agentId: req.user.id,
      amount,
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
    logger.error('Order creation failed:', err.response?.data || err.message);
    res.status(400).json({ message: err.response?.data?.message || err.message });
  }
};

exports.verifyCashfreePayment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { order_id } = req.body;
    const settings = await Settings.findOne({ key: 'portal' });
    const response = await axios.get(
      `${getCashfreeUrl(settings)}/orders/${order_id}`,
      { headers: getCashfreeHeaders(settings) }
    );

    if (response.data.order_status !== 'PAID') {
      return res.status(400).json({ message: `Payment status: ${response.data.order_status}` });
    }

    let fundRequest;
    let user;

    try {
      await session.withTransaction(async () => {
        fundRequest = await FundRequest.findOneAndUpdate(
          { transactionId: order_id, agentId: req.user.id, status: 'pending' },
          {
            $set: {
              status: 'approved',
              processedAt: Date.now(),
              processedBy: req.user.id
            }
          },
          { new: true, session }
        );

        if (!fundRequest) {
          const alreadyDone = await FundRequest.findOne({
            transactionId: order_id,
            agentId: req.user.id,
            status: 'approved'
          }).session(session);

          if (alreadyDone) {
            throw Object.assign(new Error('Already processed'), { statusCode: 200 });
          }

          throw Object.assign(new Error('Transaction record not found or already processed'), { statusCode: 400 });
        }

        user = await User.findByIdAndUpdate(
          fundRequest.agentId,
          { $inc: { walletBalance: Number(fundRequest.amount) } },
          { new: true, session }
        );

        await WalletTransaction.create([{
          agentId: user._id,
          type: 'credit',
          amount: Number(fundRequest.amount),
          reason: 'Online Wallet Topup (Cashfree)',
          performedBy: user._id,
          balanceAfter: user.walletBalance
        }], { session });
      });
    } catch (err) {
      if (err.message?.includes('replica set') || err.message?.includes('Transaction numbers')) {
        // Fallback for standalone MongoDB (No Transaction Support)
        fundRequest = await FundRequest.findOneAndUpdate(
          { transactionId: order_id, agentId: req.user.id, status: 'pending' },
          {
            $set: {
              status: 'approved',
              processedAt: Date.now(),
              processedBy: req.user.id
            }
          },
          { new: true }
        );

        if (!fundRequest) {
          const alreadyDone = await FundRequest.findOne({
            transactionId: order_id,
            agentId: req.user.id,
            status: 'approved'
          });

          if (alreadyDone) {
            return res.status(200).json({ success: true, message: 'Already processed' });
          }

          return res.status(400).json({ message: 'Transaction record not found or already processed' });
        }

        user = await User.findByIdAndUpdate(
          fundRequest.agentId,
          { $inc: { walletBalance: Number(fundRequest.amount) } },
          { new: true }
        );

        await WalletTransaction.create([{
          agentId: user._id,
          type: 'credit',
          amount: Number(fundRequest.amount),
          reason: 'Online Wallet Topup (Cashfree)',
          performedBy: user._id,
          balanceAfter: user.walletBalance
        }]);
      } else {
        throw err;
      }
    }

    try {
      await sendEmail({
        email: user.email,
        subject: 'Wallet Recharge Successful',
        message: `Hello ${user.name},\n\nYour wallet has been recharged via Cashfree.\n\nAmount: Rs.${fundRequest.amount}\nOrder ID: ${order_id}\nNew Balance: Rs.${user.walletBalance}`,
      });
    } catch (err) {}

    res.status(200).json({ success: true, message: 'Payment verified' });
  } catch (err) {
    if (err.statusCode === 200) return res.status(200).json({ success: true, message: err.message });
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    logger.error('Verification Error:', err.response?.data || err.message);
    res.status(400).json({ message: err.response?.data?.message || err.message });
  } finally {
    session.endSession();
  }
};

exports.submitOfflineRequest = async (req, res, next) => {
  try {
    const { transactionId } = req.body;
    const amount = parsePositiveAmount(req.body.amount, 50);

    if (!amount) {
      return res.status(400).json({ message: 'Minimum wallet load amount is Rs.50' });
    }

    if (!transactionId) {
      return res.status(400).json({ message: 'Please provide a transaction reference' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a payment proof' });
    }

    // Upload to Supabase and get the public URL
    const publicUrl = await uploadToSupabase(req.file, 'proofs');

    const fundRequest = await FundRequest.create({
      agentId: req.user.id,
      amount,
      method: 'offline',
      status: 'pending',
      transactionId,
      proofImage: publicUrl
    });

    res.status(201).json({ success: true, data: fundRequest });
  } catch (err) {
    next(err);
  }
};

exports.getFundRequests = async (req, res, next) => {
  try {
    const query = req.user.role === 'admin' ? {} : { agentId: req.user.id };
    const requests = await FundRequest.find(query)
      .populate('agentId', 'name email')
      .populate('processedBy', 'name')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    next(err);
  }
};

exports.updateFundRequestStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  let request;
  let user;

  try {
    const { status, adminRemark } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid request status' });
    }

    try {
      await session.withTransaction(async () => {
        request = await FundRequest.findOneAndUpdate(
          { _id: req.params.id, status: 'pending' },
          {
            $set: {
              status,
              adminRemark,
              processedBy: req.user.id,
              processedAt: Date.now()
            }
          },
          { new: true, session }
        );

        if (!request) {
          throw Object.assign(new Error('Request not found or already processed'), { statusCode: 400 });
        }

        if (status === 'approved') {
          user = await User.findByIdAndUpdate(
            request.agentId,
            { $inc: { walletBalance: request.amount } },
            { new: true, session }
          );

          await WalletTransaction.create([{
            agentId: user._id,
            type: 'credit',
            amount: request.amount,
            reason: 'Offline Wallet Topup (Admin Approved)',
            performedBy: req.user.id,
            balanceAfter: user.walletBalance
          }], { session });
        }
      });
    } catch (err) {
      if (err.message?.includes('replica set') || err.message?.includes('Transaction numbers')) {
        // Fallback for standalone MongoDB (No Transaction Support)
        request = await FundRequest.findOneAndUpdate(
          { _id: req.params.id, status: 'pending' },
          {
            $set: {
              status,
              adminRemark,
              processedBy: req.user.id,
              processedAt: Date.now()
            }
          },
          { new: true }
        );

        if (!request) {
          return res.status(400).json({ message: 'Request not found or already processed' });
        }

        if (status === 'approved') {
          user = await User.findByIdAndUpdate(
            request.agentId,
            { $inc: { walletBalance: request.amount } },
            { new: true }
          );

          await WalletTransaction.create([{
            agentId: user._id,
            type: 'credit',
            amount: request.amount,
            reason: 'Offline Wallet Topup (Admin Approved)',
            performedBy: req.user.id,
            balanceAfter: user.walletBalance
          }]);
        }
      } else {
        throw err;
      }
    }

    await createNotification({
      userId: request.agentId,
      title: `Wallet Request ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Your offline wallet request of Rs.${request.amount} has been ${status}. ${adminRemark ? `Remark: ${adminRemark}` : ''}`,
      type: 'wallet_approved'
    });

    try {
      user = user || await User.findById(request.agentId);
      if (user) {
        await sendEmail({
          email: user.email,
          subject: `Wallet Recharge Request: ${status.toUpperCase()}`,
          message: `Hello ${user.name},\n\nYour offline wallet recharge request has been ${status}.\n\nAmount: Rs.${request.amount}\nStatus: ${status.toUpperCase()}\nRemark: ${adminRemark || 'None'}\n${status === 'approved' ? `New Balance: Rs.${user.walletBalance}` : ''}\n\nPlease log in to your dashboard for details.\n\nBest regards,\nSevainest Team`,
        });
      }
    } catch (err) {
      logger.error('Offline recharge status email could not be sent');
    }

    res.status(200).json({ success: true, data: request });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    next(err);
  } finally {
    session.endSession();
  }
};

exports.getAdminTransactions = async (req, res, next) => {
  try {
    const { date } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const query = {};

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query)
        .populate('agentId', 'name email')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      WalletTransaction.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: transactions.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: transactions
    });
  } catch (err) {
    next(err);
  }
};
