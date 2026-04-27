const Service = require('../models/Service');
const fs = require('fs');
const path = require('path');

// @desc    Get all active services
// @route   GET /api/services
// @access  Private
exports.getServices = async (req, res, next) => {
  try {
    const services = await Service.find({ status: 'active' });
    res.status(200).json({ success: true, count: services.length, data: services });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all services (Admin only)
// @route   GET /api/services/all
// @access  Private/Admin
exports.getAllServices = async (req, res, next) => {
  try {
    const services = await Service.find();
    res.status(200).json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new service
// @route   POST /api/services
// @access  Private/Admin
exports.createService = async (req, res, next) => {
  try {
    const serviceData = { ...req.body };
    serviceData.createdBy = req.user.id;

    // Handle Image
    if (req.file) {
      serviceData.imageUrl = `/uploads/services/${req.file.filename}`;
    }

    // Multer/FormData might stringify arrays
    if (typeof serviceData.formFields === 'string') {
      serviceData.formFields = JSON.parse(serviceData.formFields);
    }

    const service = await Service.create(serviceData);
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

// @desc    Update service
// @route   PUT /api/services/:id
// @access  Private/Admin
exports.updateService = async (req, res, next) => {
  try {
    let service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    const updateData = { ...req.body };

    // Handle Image
    if (req.file) {
      // Delete old image if exists
      if (service.imageUrl) {
        const oldImagePath = path.join(process.cwd(), service.imageUrl.substring(1));
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updateData.imageUrl = `/uploads/services/${req.file.filename}`;
    }

    // Parse formFields if stringified
    if (typeof updateData.formFields === 'string') {
      updateData.formFields = JSON.parse(updateData.formFields);
    }

    service = await Service.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete service
// @route   DELETE /api/services/:id
// @access  Private/Admin
exports.deleteService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Delete image if exists
    if (service.imageUrl) {
      const imagePath = path.join(process.cwd(), service.imageUrl.substring(1));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await service.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};
