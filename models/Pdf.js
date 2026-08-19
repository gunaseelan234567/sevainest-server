const mongoose = require('mongoose');

const pdfSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a PDF title'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
  },
  price: {
    type: Number,
    required: [true, 'Please add a price'],
  },
  fileUrl: {
    type: String,
    required: [true, 'Please upload a PDF file'],
  },
  fileKey: {
    type: String,
  },
  imageUrl: {
    type: String,
  },
  imageKey: {
    type: String,
  },
  storage: {
    type: String,
    default: 'supabase',
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

// Exclude soft-deleted PDFs in normal queries
pdfSchema.pre(/^find/, function () {
  if (this.getFilter().isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

module.exports = mongoose.model('Pdf', pdfSchema);
