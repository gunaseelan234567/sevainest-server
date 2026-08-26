const mongoose = require('mongoose');

const parameterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Parameter name is required'],
    trim: true,
  },
  label: {
    type: String,
    required: [true, 'Parameter label is required'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['text', 'number', 'date', 'select'],
    default: 'text',
  },
  required: {
    type: Boolean,
    default: true,
  },
  placeholder: {
    type: String,
    default: '',
  },
  options: {
    type: [String],
    default: [],
  },
});

const responseFieldSchema = new mongoose.Schema({
  key: {
    type: String,
    required: [true, 'Response field key is required'],
    trim: true,
  },
  label: {
    type: String,
    required: [true, 'Response field label is required'],
    trim: true,
  }
});

const instantServiceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a service name'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Please add a short description'],
    trim: true,
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
    default: 'Other',
  },
  imageUrl: {
    type: String,
  },
  imageKey: {
    type: String,
  },
  storage: {
    type: String,
    default: 's3',
  },
  provider: {
    type: String,
    required: true,
    default: 'neoapi',
  },
  endpoint: {
    type: String,
    required: [true, 'Please add a NeoAPI endpoint path or URL'],
    trim: true,
  },
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST'],
    default: 'POST',
  },
  parameters: [parameterSchema],
  responseFields: [responseFieldSchema],
  serviceAmount: {
    type: Number,
    required: [true, 'Please add a service amount'],
    min: [0, 'Amount cannot be negative'],
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
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

// Exclude soft-deleted instant services in normal queries
instantServiceSchema.pre(/^find/, function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

// Production safeguard blocking mass deletion
instantServiceSchema.pre('deleteMany', async function () {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('❌ SECURITY ERROR: deleteMany is strictly blocked on InstantService collection in production mode! Use --force to override.');
  }
});

module.exports = mongoose.model('InstantService', instantServiceSchema);
