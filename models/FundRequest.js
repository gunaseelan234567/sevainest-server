const mongoose = require('mongoose');

const fundRequestSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  method: {
    type: String,
    enum: ['online', 'offline'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  transactionId: {
    type: String, // Razorpay Payment ID or manual ref
    unique: true,
    sparse: true
  },
  razorpayOrderId: {
    type: String,
    sparse: true
  },
  proofImage: {
    type: String // Base64 or Path for offline requests
  },
  proofImageKey: {
    type: String
  },
  storage: {
    type: String,
    default: 'supabase'
  },
  adminRemark: {
    type: String
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('FundRequest', fundRequestSchema);
