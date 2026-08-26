const mongoose = require('mongoose');

const instantServiceFileSchema = new mongoose.Schema({
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InstantServiceTransaction',
    required: [true, 'Transaction reference is required'],
  },
  providerField: {
    type: String,
    required: [true, 'Provider field name is required'],
    trim: true,
  },
  label: {
    type: String,
    required: [true, 'File display label is required'],
    trim: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['file', 'image'],
  },
  fileType: {
    type: String,
    required: true,
    enum: ['pdf', 'jpeg', 'png', 'gif'],
  },
  mimeType: {
    type: String,
    required: [true, 'MIME type is required'],
    trim: true,
  },
  fileName: {
    type: String,
    required: [true, 'File name is required'],
    trim: true,
  },
  storageKey: {
    type: String,
    required: [true, 'S3 storage key is required'],
    trim: true,
  },
  size: {
    type: Number,
    required: [true, 'File size in bytes is required'],
    min: [0, 'Size cannot be negative'],
  },
  providerSourceType: {
    type: String,
    enum: ['data_uri', 'base64', 'url', 'buffer'],
  },
  checksum: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['stored', 'failed'],
    default: 'stored',
  },
}, {
  timestamps: true,
});

// Create indexes for efficient querying
instantServiceFileSchema.index({ transactionId: 1 });
instantServiceFileSchema.index({ transactionId: 1, providerField: 1 });

module.exports = mongoose.model('InstantServiceFile', instantServiceFileSchema);
