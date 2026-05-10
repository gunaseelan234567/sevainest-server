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
}, {
  timestamps: true,
});

module.exports = mongoose.model('Notice', noticeSchema);
