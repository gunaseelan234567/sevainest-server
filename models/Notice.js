const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Please add notice content'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  url: {
    type: String,
  },
  icon: {
    type: String,
    default: 'Bell',
  },
  color: {
    type: String,
    default: '#3b82f6', // Default blue
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

// Exclude soft-deleted notices in normal queries
noticeSchema.pre(/^find/, function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

module.exports = mongoose.model('Notice', noticeSchema);
