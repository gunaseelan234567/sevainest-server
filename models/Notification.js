const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['application_submitted', 'wallet_approved', 'ticket_reply', 'service_update', 'application_rejected', 'general'],
    default: 'general',
  },
  isRead: {
    type: Boolean,
    default: false,
  }
}, {
  timestamps: { createdAt: 'timestamp', updatedAt: false }
});

module.exports = mongoose.model('Notification', notificationSchema);
