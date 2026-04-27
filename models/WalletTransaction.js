const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  performedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User', // Can be Admin or the Agent themselves (in case of automatic deduction)
    required: true,
  },
  balanceAfter: {
    type: Number,
    required: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
