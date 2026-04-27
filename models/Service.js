const mongoose = require('mongoose');

const fieldSchema = new mongoose.Schema({
  label: { type: String, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['text', 'textarea', 'number', 'date', 'dropdown', 'checkbox', 'file'],
    required: true,
  },
  required: { type: Boolean, default: false },
  placeholder: { type: String },
  options: [{ type: String }], // For dropdowns
  allowedTypes: [{ type: String }], // For file uploads
});

const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a service title'],
    trim: true,
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
  },
  chargeAmount: {
    type: Number,
    required: [true, 'Please add a charge amount'],
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  imageUrl: {
    type: String,
  },
  description: {
    type: String,
    required: [true, 'Please add a short description'],
  },
  formFields: [fieldSchema],
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Service', serviceSchema);
