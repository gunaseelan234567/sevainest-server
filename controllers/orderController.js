const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const axios = require('axios');
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
  if (appId?.includes('prod') || secretKey?.includes('prod')) return 'https://api.cashfree.com/pg';
  if (appId?.includes('TEST') || secretKey?.includes('test')) return 'https://sandbox.cashfree.com/pg';
  return (settings.cashfreeEnvironment || 'sandbox') === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
};

// @desc    Create new order (Purchase Product via Wallet)
// @route   POST /api/orders
// @access  Private/Agent
exports.createOrder = async (req, res, next) => {
  try {
    const { productId, quantity, shippingAddress } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.status !== 'active') return res.status(400).json({ message: 'Product is not available' });
    if (product.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    const totalPrice = product.price * quantity;

    // Check wallet balance
    const user = await User.findById(req.user.id);
    if (user.walletBalance < totalPrice) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Create order
    const order = await Order.create({
      user: req.user.id,
      product: productId,
      quantity,
      totalPrice,
      shippingAddress,
      paymentMethod: 'wallet',
      paymentStatus: 'paid'
    });

    // Deduct from wallet
    user.walletBalance -= totalPrice;
    await user.save();

    // Log transaction
    await WalletTransaction.create({
      agentId: req.user.id,
      type: 'debit',
      amount: totalPrice,
      reason: `Purchased product: ${product.name} (Qty: ${quantity})`,
      performedBy: req.user.id,
      balanceAfter: user.walletBalance
    });

    // Update product stock
    product.stock -= quantity;
    await product.save();

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// @desc    Initiate Cashfree direct payment for product
// @route   POST /api/orders/initiate-online
// @access  Private/Agent
exports.initiateOnlineOrder = async (req, res, next) => {
  try {
    const { productId, quantity, shippingAddress } = req.body;
    const settings = await Settings.findOne({ key: 'portal' });
    const product = await Product.findById(productId);

    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    const totalPrice = product.price * quantity;
    const orderId = `prod_${Date.now()}`;

    const orderData = {
      order_amount: totalPrice,
      order_currency: "INR",
      order_id: orderId,
      customer_details: {
        customer_id: String(req.user.id),
        customer_email: req.user.email,
        customer_phone: req.user.phone || "9999999999"
      }
    };

    const response = await axios.post(
      `${getCashfreeUrl(settings)}/orders`,
      orderData,
      { headers: getCashfreeHeaders(settings) }
    );

    // Create a pending order in DB
    await Order.create({
      user: req.user.id,
      product: productId,
      quantity,
      totalPrice,
      shippingAddress,
      paymentMethod: 'online',
      paymentStatus: 'pending',
      transactionId: orderId
    });

    res.status(200).json({ success: true, order: response.data });
  } catch (err) {
    res.status(400).json({ message: err.response?.data?.message || err.message });
  }
};

// @desc    Verify Cashfree payment for product
// @route   POST /api/orders/verify-online
// @access  Private/Agent
exports.verifyOnlineOrder = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const settings = await Settings.findOne({ key: 'portal' });

    const response = await axios.get(
      `${getCashfreeUrl(settings)}/orders/${order_id}`,
      { headers: getCashfreeHeaders(settings) }
    );

    if (response.data.order_status === 'PAID') {
      const order = await Order.findOne({ transactionId: order_id, paymentStatus: 'pending' });
      if (!order) return res.status(400).json({ message: 'Order not found or already processed' });

      order.paymentStatus = 'paid';
      await order.save();

      // Update stock
      const product = await Product.findById(order.product);
      product.stock -= order.quantity;
      await product.save();

      res.status(200).json({ success: true, message: 'Payment verified and order placed' });
    } else {
      res.status(400).json({ message: `Payment status: ${response.data.order_status}` });
    }
  } catch (err) {
    res.status(400).json({ message: err.response?.data?.message || err.message });
  }
};

// @desc    Create new order (Offline Payment)
// @route   POST /api/orders/offline
// @access  Private/Agent
exports.createOfflineOrder = async (req, res, next) => {
  try {
    const { productId, quantity, shippingAddress, transactionId } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    const totalPrice = product.price * quantity;

    // Create order with pending payment status
    const order = await Order.create({
      user: req.user.id,
      product: productId,
      quantity,
      totalPrice,
      shippingAddress,
      paymentMethod: 'offline',
      paymentStatus: 'pending',
      transactionId
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// @desc    Get agent orders
// @route   GET /api/orders/my
// @access  Private/Agent
exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate('product', 'name price imageUrl')
      .sort('-createdAt');
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .populate('product', 'name price imageUrl')
      .sort('-createdAt');
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    next(err);
  }
};

// @desc    Update order status (Admin)
// @route   PATCH /api/orders/:id
// @access  Private/Admin
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, paymentStatus, trackingNumber } = req.body;
    let order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (status) order.status = status;
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
    if (paymentStatus) {
      // If payment was pending and now marked paid, update stock for offline orders
      if (order.paymentStatus === 'pending' && paymentStatus === 'paid') {
        const product = await Product.findById(order.product);
        if (product) {
          product.stock -= order.quantity;
          await product.save();
        }
      }
      order.paymentStatus = paymentStatus;
    }
    
    await order.save();

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// @desc    Agent: Confirm order receipt (Mark as Delivered)
// @route   PATCH /api/orders/:id/confirm
// @access  Private/Agent
exports.confirmOrderReceipt = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status === 'delivered') {
      return res.status(400).json({ message: 'Order is already marked as delivered' });
    }

    if (!['shipped', 'on-the-way', 'packed'].includes(order.status)) {
      return res.status(400).json({ message: 'Order cannot be confirmed yet' });
    }

    order.status = 'delivered';
    await order.save();

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};
