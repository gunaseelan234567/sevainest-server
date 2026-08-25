const Application = require('../models/Application');
const Order = require('../models/Order');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const InstantServiceTransaction = require('../models/InstantServiceTransaction');

// @desc    Get Admin Finance Stats & Revenue
// @route   GET /api/finance/stats
// @access  Private/Admin
exports.getFinanceStats = async (req, res, next) => {
  try {
    const { dateRange, startDate, endDate } = req.query;
    let start, end;
    const now = new Date();

    if (dateRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (dateRange === 'weekly') {
      // Last 7 days
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      end = now;
    } else if (dateRange === 'monthly') {
      // Last 30 days
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      end = now;
    } else if (dateRange === 'custom' && startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    // Date boundary query object
    const dateQuery = {};
    if (start && end) {
      dateQuery.createdAt = { $gte: start, $lte: end };
    }

    // 1. Core Revenue Calculations (Aggregated)
    const serviceRevenueResult = await Application.aggregate([
      { $match: { isDeleted: { $ne: true }, ...dateQuery } },
      { $group: { _id: null, total: { $sum: '$chargeDeducted' } } }
    ]);
    const serviceRevenue = serviceRevenueResult[0]?.total || 0;

    const productRevenueResult = await Order.aggregate([
      { $match: { paymentStatus: 'paid', ...dateQuery } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);
    const productRevenue = productRevenueResult[0]?.total || 0;

    const pdfRevenueResult = await WalletTransaction.aggregate([
      { 
        $match: { 
          type: 'debit', 
          reason: { $regex: /^Purchased PDF:/i }, 
          isDeleted: { $ne: true },
          ...dateQuery
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pdfRevenue = pdfRevenueResult[0]?.total || 0;

    const instantServiceRevenueResult = await InstantServiceTransaction.aggregate([
      { $match: { status: 'success', ...dateQuery } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const instantServiceRevenue = instantServiceRevenueResult[0]?.total || 0;

    const totalRevenue = serviceRevenue + productRevenue + pdfRevenue + instantServiceRevenue;

    // 2. Deposits (Credits) calculation
    const depositsResult = await WalletTransaction.aggregate([
      { $match: { type: 'credit', isDeleted: { $ne: true }, ...dateQuery } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalDeposits = depositsResult[0]?.total || 0;

    // 3. User & agent count statistics
    const totalAgents = await User.countDocuments({ role: 'agent' });

    // 4. Monthly Trend calculations (past 12 months)
    const monthlyServices = await Application.aggregate([
      { $match: { isDeleted: { $ne: true }, ...dateQuery } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          amount: { $sum: '$chargeDeducted' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const monthlyProducts = await Order.aggregate([
      { $match: { paymentStatus: 'paid', ...dateQuery } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          amount: { $sum: '$totalPrice' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const monthlyPdfs = await WalletTransaction.aggregate([
      { 
        $match: { 
          type: 'debit', 
          reason: { $regex: /^Purchased PDF:/i }, 
          isDeleted: { $ne: true },
          ...dateQuery
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const monthlyInstantServices = await InstantServiceTransaction.aggregate([
      { $match: { status: 'success', ...dateQuery } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Align monthly data into a single array structure
    const monthsSet = new Set([
      ...monthlyServices.map(d => d._id),
      ...monthlyProducts.map(d => d._id),
      ...monthlyPdfs.map(d => d._id),
      ...monthlyInstantServices.map(d => d._id)
    ]);
    const monthsSorted = Array.from(monthsSet).sort();

    const trendData = monthsSorted.map(month => {
      const sAmt = monthlyServices.find(d => d._id === month)?.amount || 0;
      const pAmt = monthlyProducts.find(d => d._id === month)?.amount || 0;
      const pdfAmt = monthlyPdfs.find(d => d._id === month)?.amount || 0;
      const instantAmt = monthlyInstantServices.find(d => d._id === month)?.amount || 0;
      return {
        month,
        services: sAmt,
        products: pAmt,
        pdfs: pdfAmt,
        instantServices: instantAmt,
        total: sAmt + pAmt + pdfAmt + instantAmt
      };
    });

    // 5. Recent Finance Activity Ledger
    // Apply date boundary filter to ledger entries
    const recentWalletTransactions = await WalletTransaction.find({ 
      isDeleted: { $ne: true },
      ...dateQuery 
    })
      .sort('-createdAt')
      .limit(30)
      .populate('agentId', 'name email');

    const recentProductOrders = await Order.find({ 
      paymentStatus: 'paid',
      ...dateQuery 
    })
      .sort('-createdAt')
      .limit(30)
      .populate('user', 'name email')
      .populate('product', 'title price');

    const recentApplications = await Application.find({ 
      isDeleted: { $ne: true },
      ...dateQuery
    })
      .sort('-createdAt')
      .limit(30)
      .populate('agentId', 'name email')
      .populate('serviceId', 'title chargeAmount');

    const recentInstantServices = await InstantServiceTransaction.find({
      status: 'success',
      ...dateQuery
    })
      .sort('-createdAt')
      .limit(30)
      .populate('agentId', 'name email');

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          serviceRevenue,
          productRevenue,
          pdfRevenue,
          instantServiceRevenue,
          totalDeposits,
          totalAgents
        },
        trendData,
        recentActivity: {
          wallet: recentWalletTransactions,
          orders: recentProductOrders,
          applications: recentApplications,
          instantServices: recentInstantServices
        }
      }
    });
  } catch (err) {
    next(err);
  }
};
