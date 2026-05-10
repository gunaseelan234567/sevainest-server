const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  product: {
    type: mongoose.Schema.ObjectId,
    ref: 'Product',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  shippingAddress: {
    type: String,
    required: [true, 'Please add a shipping address'],
  },
  paymentMethod: {
    type: String,
    enum: ['wallet', 'online', 'offline'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending',
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'packed', 'on-the-way', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  transactionId: {
    type: String, // For offline/online reference
  },
  trackingNumber: {
    type: String,
  },
  registrationOrderId: {
    type: String, // For Cashfree order linking
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Order', orderSchema);
