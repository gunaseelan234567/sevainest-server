const mongoose = require('mongoose');

// Singleton settings document — only one ever exists, identified by key: 'portal'
const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'portal',
    unique: true
  },
  // General
  portalName: { type: String, default: 'eSevai Connect' },
  supportEmail: { type: String, default: 'support@esevai.in' },
  maintenanceMode: { type: Boolean, default: false },
  newRegistrations: { type: Boolean, default: true },
  // Payment
  minTopup: { type: Number, default: 100 },
  maxTopup: { type: Number, default: 50000 },
  onlinePaymentEnabled: { type: Boolean, default: true },
  offlinePaymentEnabled: { type: Boolean, default: true },
  // Security
  jwtExpiry: { type: String, default: '24h' },
  maxLoginAttempts: { type: Number, default: 5 },
  activityLogs: { type: Boolean, default: true },
  // Notifications
  emailNotifications: { type: Boolean, default: true },
  applicationAlerts: { type: Boolean, default: true },
  walletAlerts: { type: Boolean, default: true },
  smsNotifications: { type: Boolean, default: false },
  agentRegistrationFee: { type: Number, default: 100 },
  // Payment Gateways
  activePaymentGateway: { 
    type: String, 
    enum: ['cashfree', 'razorpay'], 
    default: 'cashfree' 
  },
  razorpayKeyId: { type: String, default: '' },
  razorpayKeySecret: { type: String, default: '' },
  cashfreeAppId: { type: String, default: '' },
  cashfreeSecretKey: { type: String, default: '' },
  cashfreeEnvironment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
  // Manual Payment
  manualPaymentQR: { type: String, default: '' },
  upiId: { type: String, default: '' },
}, {
  timestamps: true
});

module.exports = mongoose.model('Settings', settingsSchema);
