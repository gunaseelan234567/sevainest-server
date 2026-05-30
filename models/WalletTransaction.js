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
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Exclude soft-deleted transactions in normal queries
walletTransactionSchema.pre(/^find/, function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
