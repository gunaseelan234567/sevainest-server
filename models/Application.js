const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  applicationId: {
    type: String,
    required: true,
    unique: true,
  },
  serviceId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Service',
    required: true,
  },
  agentId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  formData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    required: true,
  },
  uploadedFiles: [{
    fieldName: String,
    fileName: String,
    fileUrl: String,
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'returned'],
    default: 'pending',
  },
  adminRemark: {
    type: String,
    default: '',
  },
  chargeDeducted: {
    type: Number,
    required: true,
  },
  isResubmitted: {
    type: Boolean,
    default: false,
  },
  approvedDoc: {
    fileName: String,
    fileUrl: String,
  },
  refundedAt: {
    type: Date,
  },
  refundTransactionId: {
    type: mongoose.Schema.ObjectId,
    ref: 'WalletTransaction',
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

// Exclude soft-deleted applications in normal queries
applicationSchema.pre(/^find/, function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

// Middleware to generate custom Application ID if not provided
applicationSchema.pre('validate', async function() {
  if (!this.applicationId) {
    const count = await mongoose.model('Application').countDocuments();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.applicationId = `APP-${date}-${(count + 1).toString().padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Application', applicationSchema);
