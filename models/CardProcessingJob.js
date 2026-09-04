const mongoose = require('mongoose');

const cardProcessingJobSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  profile: {
    type: mongoose.Schema.ObjectId,
    ref: 'CardProcessingProfile',
    required: true,
  },
  sourceFile: {
    key: { type: String, required: true },
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
  },
  outputFile: {
    key: { type: String },
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
  },
  status: {
    type: String,
    enum: ['pending', 'password_required', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  amountCharged: {
    type: Number,
    default: 0,
  },
  configurationVersion: {
    type: Number,
    required: true,
  },
  processingSnapshot: {
    source: {
      pageNumber: { type: Number },
      pageWidth: { type: Number },
      pageHeight: { type: Number },
      pagesCount: { type: Number },
    },
    crop: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number },
      height: { type: Number },
    },
    normalizedCrop: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number },
      height: { type: Number },
    },
    cropBack: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number },
      height: { type: Number },
      pageNumber: { type: Number },
    },
    normalizedCropBack: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number },
      height: { type: Number },
    },
    output: {
      width: { type: Number },
      height: { type: Number },
      unit: { type: String },
      dpi: { type: Number },
    },
    layoutMode: { type: String },
    cropMappingMode: { type: String },
  },
  error: {
    type: String,
  },
  startedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('CardProcessingJob', cardProcessingJobSchema);
