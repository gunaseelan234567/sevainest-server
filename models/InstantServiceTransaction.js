const mongoose = require('mongoose');

const instantServiceTransactionSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  instantServiceId: {
    type: mongoose.Schema.ObjectId,
    ref: 'InstantService',
    required: true,
  },
  serviceName: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  requestData: {
    type: mongoose.Schema.Types.Mixed, // Masked parameters submitted by agent
  },
  provider: {
    type: String,
    default: 'neoapi',
  },
  providerReference: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending',
  },
  result: {
    type: mongoose.Schema.Types.Mixed, // Masked response from NeoAPI
  },
  errorCode: {
    type: String,
  },
  errorMessage: {
    type: String,
  },
  completedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Production safeguard blocking mass deletion
instantServiceTransactionSchema.pre('deleteMany', async function () {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('❌ SECURITY ERROR: deleteMany is strictly blocked on InstantServiceTransaction collection in production mode! Use --force to override.');
  }
});

module.exports = mongoose.model('InstantServiceTransaction', instantServiceTransactionSchema);
