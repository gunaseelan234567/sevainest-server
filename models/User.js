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
  isTwoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: String,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  permissions: {
    type: [String],
    default: ['users.read', 'services.read'], // Default dynamic permissions
  },
}, {
  timestamps: true,
});

// Exclude soft-deleted users in normal queries
userSchema.pre(/^find/, function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

// Production safeguard blocking mass deletion
userSchema.pre('deleteMany', async function () {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('❌ SECURITY ERROR: deleteMany is strictly blocked on User collection in production mode! Use --force to override.');
  }
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

// Post-delete hooks to log user removals for production audit trails
userSchema.post('deleteOne', { document: true, query: false }, function (doc) {
  console.warn(`[AUDIT] 🚨 USER DELETED: ID: ${doc._id} | Email: ${doc.email} | Role: ${doc.role} at ${new Date().toISOString()}`);
});

userSchema.post('findOneAndDelete', function (doc) {
  if (doc) {
    console.warn(`[AUDIT] 🚨 USER DELETED via query: ID: ${doc._id} | Email: ${doc.email} | Role: ${doc.role} at ${new Date().toISOString()}`);
  }
});

userSchema.post('deleteMany', function (res) {
  console.warn(`[AUDIT] 🚨 USER COLLECTION WIPED: deleteMany called at ${new Date().toISOString()}.`);
});

module.exports = mongoose.model('User', userSchema);
