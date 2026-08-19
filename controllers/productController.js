const Product = require('../models/Product');
const AuditLog = require('../models/AuditLog');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadFile, getSignedDownloadUrl, generateS3Key } = require('../utils/s3Storage');

// @desc    Get all products (Agent/Public)
// @route   GET /api/products
// @access  Private
exports.getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ status: 'active' }).sort('-createdAt');
    const signedProducts = await Promise.all(products.map(async prod => {
      const prodObj = prod.toObject();
      if (prodObj.storage === 's3' && prodObj.imageKey) {
        try {
          prodObj.imageUrl = await getSignedDownloadUrl(prodObj.imageKey, 900);
        } catch (err) {
          console.error(`Failed to sign S3 product image: ${prodObj.imageKey}`, err);
        }
      }
      return prodObj;
    }));
    res.status(200).json({
      success: true,
      count: signedProducts.length,
      data: signedProducts
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all products for admin
// @route   GET /api/products/admin
// @access  Private/Admin
exports.getAdminProducts = async (req, res, next) => {
  try {
    const products = await Product.find().sort('-createdAt');
    const signedProducts = await Promise.all(products.map(async prod => {
      const prodObj = prod.toObject();
      if (prodObj.storage === 's3' && prodObj.imageKey) {
        try {
          prodObj.imageUrl = await getSignedDownloadUrl(prodObj.imageKey, 900);
        } catch (err) {
          console.error(`Failed to sign S3 product image: ${prodObj.imageKey}`, err);
        }
      }
      return prodObj;
    }));
    res.status(200).json({
      success: true,
      count: signedProducts.length,
      data: signedProducts
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = async (req, res, next) => {
  try {
    req.body.createdBy = req.user.id;
    const productId = new mongoose.Types.ObjectId();
    req.body._id = productId;
    
    if (req.file) {
      const uniqueKey = generateS3Key('products', productId.toString(), req.file.originalname);
      await uploadFile({
        buffer: req.file.buffer,
        key: uniqueKey,
        contentType: req.file.mimetype
      });
      req.body.imageUrl = `api/products/images/${productId}`; // Placeholder fallback
      req.body.imageKey = uniqueKey;
      req.body.storage = 's3';
    }

    const product = await Product.create(req.body);

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res, next) => {
  try {
    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (req.file) {
      const uniqueKey = generateS3Key('products', product._id.toString(), req.file.originalname);
      await uploadFile({
        buffer: req.file.buffer,
        key: uniqueKey,
        contentType: req.file.mimetype
      });
      req.body.imageUrl = `api/products/images/${product._id}`; // Placeholder fallback
      req.body.imageKey = uniqueKey;
      req.body.storage = 's3';
    }

    product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete product (Soft delete with password & logging)
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.isDeleted = true;
    product.deletedAt = new Date();
    await product.save();

    // Create success audit log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'delete',
      targetCollection: 'products',
      targetId: product._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'deleted' }
    });

    console.log(`[AUDIT] ADMIN_DELETE_PRODUCT SUCCESS: ID: ${product._id} by Admin: ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Product soft-deleted successfully',
      data: {}
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore product (Admins only)
// @route   PATCH /api/products/:id/restore
// @access  Private/Admin
exports.restoreProduct = async (req, res, next) => {
  try {
    // Specifically search with isDeleted: true to locate soft-deleted record
    const product = await Product.findOne({ _id: req.params.id, isDeleted: true });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Soft-deleted product not found' });
    }

    product.isDeleted = false;
    product.deletedAt = null;
    await product.save();

    // Create success audit log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'update',
      targetCollection: 'products',
      targetId: product._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'restored' }
    });

    console.log(`[AUDIT] ADMIN_RESTORE_PRODUCT SUCCESS: ID: ${product._id} by Admin: ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Product restored successfully',
      data: product
    });
  } catch (err) {
    next(err);
  }
};
