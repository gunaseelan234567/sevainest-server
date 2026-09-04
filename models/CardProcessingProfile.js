const mongoose = require('mongoose');

const cardProcessingProfileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a profile name'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Please add a profile code'],
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive'],
    default: 'draft',
  },
  price: {
    type: Number,
    default: 0,
    min: [0, 'Price cannot be negative'],
  },
  sampleFile: {
    key: { type: String },
    url: { type: String },
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
  },
  coverImage: {
    key: { type: String },
    url: { type: String },
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
  },
  source: {
    pageNumber: { type: Number, default: 1 },
    pageWidth: { type: Number },
    pageHeight: { type: Number },
    pagesCount: { type: Number },
  },
  layoutMode: {
    type: String,
    enum: ['single', 'double'],
    default: 'single',
  },
  cropMappingMode: {
    type: String,
    enum: ['fixed', 'normalized'],
    default: 'normalized',
  },
  crop: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  normalizedCrop: {
    x: { type: Number },
    y: { type: Number },
    width: { type: Number },
    height: { type: Number },
  },
  cropBack: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    pageNumber: { type: Number, default: 1 },
  },
  normalizedCropBack: {
    x: { type: Number },
    y: { type: Number },
    width: { type: Number },
    height: { type: Number },
  },
  output: {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    unit: {
      type: String,
      enum: ['mm', 'inch'],
      default: 'mm',
    },
    dpi: { type: Number, default: 300 },
  },
  version: {
    type: Number,
    default: 1,
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
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

// Exclude soft-deleted profiles in normal queries
cardProcessingProfileSchema.pre(/^find/, function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

module.exports = mongoose.model('CardProcessingProfile', cardProcessingProfileSchema);
