const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },
  phone: {
    type: String,
  },
  shopAddress: {
    type: String,
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false,
  },
  role: {
    type: String,
    enum: ['admin', 'agent'],
    default: 'agent',
  },
  walletBalance: {
    type: Number,
    default: 0,
  },
  isActivated: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected', 'blocked'],
    default: 'pending',
  },
  paymentMode: {
    type: String,
    enum: ['online', 'offline', 'free', 'none'],
    default: 'none',
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'pending', 'paid'],
    default: 'unpaid',
  },
  agentId: {
    type: String,
    unique: true,
    sparse: true,
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
  registrationOrderId: {
    type: String,
  },
  resetPasswordOTP: {
    type: String,
  },
  resetPasswordExpire: {
    type: Date,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationOTP: {
    type: String,
  },
  emailVerificationOTPExpire: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Encrypt password using bcrypt
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
