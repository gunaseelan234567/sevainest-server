const mongoose = require('mongoose');

const fieldSchema = new mongoose.Schema({
  label: { type: String, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['text', 'textarea', 'number', 'date', 'dropdown', 'checkbox', 'file', 'group'],
    required: true,
  },
  required: { type: Boolean, default: false },
  placeholder: { type: String },
  options: [{ type: String }], // For dropdowns
  allowedTypes: [{ type: String }], // For file uploads
});

// Add subFields to allow recursive nesting for groups
fieldSchema.add({
  subFields: [fieldSchema]
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

// Post-delete hooks to log service removals for production audit trails
serviceSchema.post('deleteOne', { document: true, query: false }, function (doc) {
  console.warn(`[AUDIT] 🚨 SERVICE DELETED: ID: ${doc._id} | Title: ${doc.title} | Category: ${doc.category} at ${new Date().toISOString()}`);
});

serviceSchema.post('findOneAndDelete', function (doc) {
  if (doc) {
    console.warn(`[AUDIT] 🚨 SERVICE DELETED via query: ID: ${doc._id} | Title: ${doc.title} | Category: ${doc.category} at ${new Date().toISOString()}`);
  }
});

serviceSchema.post('deleteMany', function (res) {
  console.warn(`[AUDIT] 🚨 SERVICE COLLECTION WIPED: deleteMany called at ${new Date().toISOString()}.`);
});

module.exports = mongoose.model('Service', serviceSchema);
