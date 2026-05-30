const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional for unauthenticated logins or guest operations
  },
  role: {
    type: String,
    default: 'guest',
  },
  actionType: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete', 'approve', 'reject', 'login', 'wallet_change', 'other'],
  },
  targetCollection: {
    type: String,
    default: '',
  },
  targetId: {
    type: String,
    default: '',
  },
  oldData: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  newData: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  ipAddress: {
    type: String,
    default: '',
  },
  userAgent: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
