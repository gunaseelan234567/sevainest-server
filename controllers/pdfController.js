const Pdf = require('../models/Pdf');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const fs = require('fs');
const path = require('path');
const { uploadToSupabase } = require('../utils/supabaseStorage');

// @desc    Get all PDFs
// @route   GET /api/pdfs
// @access  Private
exports.getPdfs = async (req, res, next) => {
  try {
    const pdfs = await Pdf.find().sort('-createdAt');
    res.status(200).json({
      success: true,
      count: pdfs.length,
      data: pdfs
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a PDF
// @route   POST /api/pdfs
// @access  Private/Admin
exports.createPdf = async (req, res, next) => {
  try {
    req.body.createdBy = req.user.id;

    if (req.files && req.files.pdfFile) {
      req.body.fileUrl = await uploadToSupabase(req.files.pdfFile[0], 'pdfs');
    } else {
      return res.status(400).json({ message: 'Please upload a PDF file' });
    }

    if (req.files && req.files.pdfImage) {
      req.body.imageUrl = await uploadToSupabase(req.files.pdfImage[0], 'pdfs');
    }

    const pdf = await Pdf.create(req.body);

    res.status(201).json({
      success: true,
      data: pdf
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a PDF
// @route   PUT /api/pdfs/:id
// @access  Private/Admin
exports.updatePdf = async (req, res, next) => {
  try {
    let pdf = await Pdf.findById(req.params.id);

    if (!pdf) {
      return res.status(404).json({ message: 'PDF not found' });
    }

    if (req.files && req.files.pdfFile) {
      req.body.fileUrl = await uploadToSupabase(req.files.pdfFile[0], 'pdfs');
    }

    if (req.files && req.files.pdfImage) {
      req.body.imageUrl = await uploadToSupabase(req.files.pdfImage[0], 'pdfs');
    }

    pdf = await Pdf.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: pdf
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a PDF
// @route   DELETE /api/pdfs/:id
// @access  Private/Admin
exports.deletePdf = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id);

    if (!pdf) {
      return res.status(404).json({ message: 'PDF not found' });
    }

    await pdf.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Download/Purchase a PDF
// @route   POST /api/pdfs/:id/download
// @access  Private/Agent
exports.downloadPdf = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id);

    if (!pdf) {
      return res.status(404).json({ message: 'PDF not found' });
    }

    const user = await User.findById(req.user.id);

    if (user.walletBalance < pdf.price) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Deduct wallet
    user.walletBalance -= pdf.price;
    await user.save();

    // Record transaction
    await WalletTransaction.create({
      agentId: user._id,
      type: 'debit',
      amount: pdf.price,
      reason: `Purchased PDF: ${pdf.title}`,
      performedBy: user._id,
      balanceAfter: user.walletBalance
    });

    res.status(200).json({
      success: true,
      fileUrl: pdf.fileUrl,
      message: 'Payment successful, downloading PDF...'
    });
  } catch (err) {
    next(err);
  }
};
