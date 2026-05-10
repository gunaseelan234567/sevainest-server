const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const Settings = require('../models/Settings');
const axios = require('axios');

// Helper for Cashfree
const getCashfreeHeaders = (settings) => ({
  'x-client-id': settings.cashfreeAppId || process.env.CASHFREE_APP_ID,
  'x-client-secret': settings.cashfreeSecretKey || process.env.CASHFREE_SECRET_KEY,
  'x-api-version': '2022-09-01',
  'Content-Type': 'application/json'
});

const getCashfreeUrl = (settings) => {
  const env = settings.cashfreeEnvironment || 'sandbox';
  return env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .populate('product', 'name price imageUrl')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get my orders
// @route   GET /api/orders/my
// @access  Private
exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate('product', 'name price imageUrl')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create order (Wallet payment)
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res, next) => {
  try {
    const { productId, quantity, shippingAddress } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    const totalPrice = product.price * quantity;
    const user = await User.findById(req.user.id).select('+password');

    if (user.walletBalance < totalPrice) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // 1. Deduct from wallet
    user.walletBalance -= totalPrice;
    await user.save();

    // 2. Create Transaction Log
    await WalletTransaction.create({
      user: user._id,
      amount: totalPrice,
      type: 'debit',
      category: 'purchase',
      description: `Purchase: ${product.name} (Qty: ${quantity})`,
      status: 'success',
      balanceAfter: user.walletBalance
    });

    // 3. Create Order
    const order = await Order.create({
      user: user._id,
      product: productId,
      quantity,
      totalPrice,
      shippingAddress,
      paymentMethod: 'wallet',
      paymentStatus: 'paid'
    });

    // 4. Update Stock
    product.stock -= quantity;
    await product.save();

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// @desc    Create Offline Order (QR payment)
// @route   POST /api/orders/offline
// @access  Private
exports.createOfflineOrder = async (req, res, next) => {
  try {
    const { productId, quantity, shippingAddress, transactionId } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    const totalPrice = product.price * quantity;

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

    // We don't deduct stock until admin marks as paid/delivered? 
    // Or we reserve stock? Let's reserve stock.
    product.stock -= quantity;
    await product.save();

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// @desc    Initiate Online Order (Cashfree)
// @route   POST /api/orders/initiate-online
// @access  Private
exports.initiateOnlineOrder = async (req, res, next) => {
  try {
    const { productId, quantity, shippingAddress } = req.body;
    const settings = await Settings.findOne({ key: 'portal' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    const totalPrice = product.price * quantity;
    const orderId = `ord_${Date.now()}_${req.user.id.slice(-4)}`;

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

    // Create order in pending state
    await Order.create({
      user: req.user.id,
      product: productId,
      quantity,
      totalPrice,
      shippingAddress,
      paymentMethod: 'online',
      paymentStatus: 'pending',
      registrationOrderId: orderId
    });

    res.status(200).json({ success: true, order: response.data });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Online Order
// @route   POST /api/orders/verify-online
// @access  Private
exports.verifyOnlineOrder = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const settings = await Settings.findOne({ key: 'portal' });

    const response = await axios.get(
      `${getCashfreeUrl(settings)}/orders/${order_id}`,
      { headers: getCashfreeHeaders(settings) }
    );

    if (response.data.order_status === 'PAID') {
      const order = await Order.findOne({ registrationOrderId: order_id });
      if (!order) return res.status(404).json({ message: 'Order not found' });

      if (order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        order.transactionId = response.data.cf_order_id;
        await order.save();

        // Deduct Stock
        const product = await Product.findById(order.product);
        product.stock -= order.quantity;
        await product.save();
      }

      res.status(200).json({ success: true, message: 'Order paid successfully' });
    } else {
      res.status(400).json({ message: 'Payment not successful' });
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Update Order (Admin only)
// @route   PATCH /api/orders/:id
// @access  Private/Admin
exports.updateOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ success: true, data: updatedOrder });
  } catch (err) {
    next(err);
  }
};
