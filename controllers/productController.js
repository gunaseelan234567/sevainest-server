const Product = require('../models/Product');
const path = require('path');
const fs = require('fs');

// @desc    Get all products (Agent/Public)
// @route   GET /api/products
// @access  Private
exports.getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ status: 'active' }).sort('-createdAt');
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
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
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
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
    
    if (req.file) {
      req.body.imageUrl = `/uploads/products/${req.file.filename}`;
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
      // Delete old image if exists
      if (product.imageUrl) {
        const oldPath = path.join(__dirname, '..', product.imageUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      req.body.imageUrl = `/uploads/products/${req.file.filename}`;
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

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.imageUrl) {
      const imgPath = path.join(__dirname, '..', product.imageUrl);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    await product.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    next(err);
  }
};
