const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a product name'],
    trim: true,
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
  },
  price: {
    type: Number,
    required: [true, 'Please add a price'],
  },
  stock: {
    type: Number,
    required: [true, 'Please add stock quantity'],
    default: 0,
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  imageUrl: {
    type: String,
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Product', productSchema);
