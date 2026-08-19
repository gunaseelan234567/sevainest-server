const Pdf = require('../models/Pdf');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const WalletTransaction = require('../models/WalletTransaction');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadFile, getSignedDownloadUrl, generateS3Key } = require('../utils/s3Storage');

// @desc    Get all PDFs
// @route   GET /api/pdfs
// @access  Private
exports.getPdfs = async (req, res, next) => {
  try {
    const pdfs = await Pdf.find().sort('-createdAt');
    const signedPdfs = await Promise.all(pdfs.map(async pdf => {
      const pdfObj = pdf.toObject();
      if (pdfObj.storage === 's3' && pdfObj.imageKey) {
        try {
          pdfObj.imageUrl = await getSignedDownloadUrl(pdfObj.imageKey, 900);
        } catch (err) {
          console.error(`Failed to sign S3 pdf image: ${pdfObj.imageKey}`, err);
        }
      }
      return pdfObj;
    }));
    res.status(200).json({
      success: true,
      count: signedPdfs.length,
      data: signedPdfs
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
    const pdfId = new mongoose.Types.ObjectId();
    req.body._id = pdfId;
    
    if (req.files && req.files.pdfFile) {
      const uniqueKey = generateS3Key('pdfs', `${pdfId}/file`, req.files.pdfFile[0].originalname);
      await uploadFile({
        buffer: req.files.pdfFile[0].buffer,
        key: uniqueKey,
        contentType: req.files.pdfFile[0].mimetype
      });
      req.body.fileUrl = `api/pdfs/download-file/${pdfId}`; // Placeholder fallback
      req.body.fileKey = uniqueKey;
      req.body.storage = 's3';
    } else {
      return res.status(400).json({ message: 'Please upload a PDF file' });
    }

    if (req.files && req.files.pdfImage) {
      const uniqueKey = generateS3Key('pdfs', `${pdfId}/image`, req.files.pdfImage[0].originalname);
      await uploadFile({
        buffer: req.files.pdfImage[0].buffer,
        key: uniqueKey,
        contentType: req.files.pdfImage[0].mimetype
      });
      req.body.imageUrl = `api/pdfs/images/${pdfId}`; // Placeholder fallback
      req.body.imageKey = uniqueKey;
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
      const uniqueKey = generateS3Key('pdfs', `${pdf._id}/file`, req.files.pdfFile[0].originalname);
      await uploadFile({
        buffer: req.files.pdfFile[0].buffer,
        key: uniqueKey,
        contentType: req.files.pdfFile[0].mimetype
      });
      req.body.fileUrl = `api/pdfs/download-file/${pdf._id}`;
      req.body.fileKey = uniqueKey;
      req.body.storage = 's3';
    }

    if (req.files && req.files.pdfImage) {
      const uniqueKey = generateS3Key('pdfs', `${pdf._id}/image`, req.files.pdfImage[0].originalname);
      await uploadFile({
        buffer: req.files.pdfImage[0].buffer,
        key: uniqueKey,
        contentType: req.files.pdfImage[0].mimetype
      });
      req.body.imageUrl = `api/pdfs/images/${pdf._id}`;
      req.body.imageKey = uniqueKey;
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

// @desc    Delete a PDF (Soft delete with password & logging)
// @route   DELETE /api/pdfs/:id
// @access  Private/Admin
exports.deletePdf = async (req, res, next) => {
  try {
    const pdf = await Pdf.findById(req.params.id);

    if (!pdf) {
      return res.status(404).json({ success: false, message: 'PDF not found' });
    }

    pdf.isDeleted = true;
    pdf.deletedAt = new Date();
    await pdf.save();

    // Create success audit log
    await AuditLog.create({
      action: 'ADMIN_DELETE_PDF',
      targetType: 'pdf',
      targetId: pdf._id,
      performedBy: req.user.id,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      status: 'success',
    });

    console.log(`[AUDIT] ADMIN_DELETE_PDF SUCCESS: ID: ${pdf._id} by Admin: ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'PDF soft-deleted successfully',
      data: {}
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore a PDF (Admins only)
// @route   PATCH /api/pdfs/:id/restore
// @access  Private/Admin
exports.restorePdf = async (req, res, next) => {
  try {
    // Specifically search with isDeleted: true to locate soft-deleted record
    const pdf = await Pdf.findOne({ _id: req.params.id, isDeleted: true });

    if (!pdf) {
      return res.status(404).json({ success: false, message: 'Soft-deleted PDF not found' });
    }

    pdf.isDeleted = false;
    pdf.deletedAt = null;
    await pdf.save();

    // Create success audit log
    await AuditLog.create({
      action: 'ADMIN_RESTORE_PDF',
      targetType: 'pdf',
      targetId: pdf._id,
      performedBy: req.user.id,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      status: 'success',
    });

    console.log(`[AUDIT] ADMIN_RESTORE_PDF SUCCESS: ID: ${pdf._id} by Admin: ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'PDF restored successfully',
      data: pdf
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

    let downloadUrl = pdf.fileUrl;
    if (pdf.storage === 's3' && pdf.fileKey) {
      try {
        downloadUrl = await getSignedDownloadUrl(pdf.fileKey, 900); // 15 mins
      } catch (err) {
        console.error(`Failed to sign S3 download URL: ${pdf.fileKey}`, err);
      }
    }

    res.status(200).json({
      success: true,
      fileUrl: downloadUrl,
      message: 'Payment successful, downloading PDF...'
    });
  } catch (err) {
    next(err);
  }
};
