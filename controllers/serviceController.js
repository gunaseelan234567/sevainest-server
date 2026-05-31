const Service = require('../models/Service');
const AuditLog = require('../models/AuditLog');
const fs = require('fs');
const path = require('path');
const { uploadToSupabase } = require('../utils/supabaseStorage');

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
      serviceData.imageUrl = await uploadToSupabase(req.file, 'services');
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
      updateData.imageUrl = await uploadToSupabase(req.file, 'services');
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

// @desc    Delete service (Soft delete with password & logging)
// @route   DELETE /api/services/:id
// @access  Private/Admin
exports.deleteService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    service.isDeleted = true;
    service.deletedAt = new Date();
    await service.save();

    // Create success audit log
    await AuditLog.create({
      action: 'ADMIN_DELETE_SERVICE',
      targetType: 'service',
      targetId: service._id,
      performedBy: req.user.id,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      status: 'success',
    });

    console.log(`[AUDIT] ADMIN_DELETE_SERVICE SUCCESS: ID: ${service._id} by Admin: ${req.user.id}`);

    res.status(200).json({ success: true, message: 'Service soft-deleted successfully', data: {} });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore service (Admins only)
// @route   PATCH /api/services/:id/restore
// @access  Private/Admin
exports.restoreService = async (req, res, next) => {
  try {
    // Specifically search with isDeleted: true to locate soft-deleted record
    const service = await Service.findOne({ _id: req.params.id, isDeleted: true });

    if (!service) {
      return res.status(404).json({ success: false, message: 'Soft-deleted service not found' });
    }

    service.isDeleted = false;
    service.deletedAt = null;
    await service.save();

    // Create success audit log
    await AuditLog.create({
      action: 'ADMIN_RESTORE_SERVICE',
      targetType: 'service',
      targetId: service._id,
      performedBy: req.user.id,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      status: 'success',
    });

    console.log(`[AUDIT] ADMIN_RESTORE_SERVICE SUCCESS: ID: ${service._id} by Admin: ${req.user.id}`);

    res.status(200).json({ success: true, message: 'Service restored successfully', data: service });
  } catch (err) {
    next(err);
  }
};

// @desc    Bulk update ESevai status of services
// @route   PUT /api/services/esevai-setup
// @access  Private/Admin
exports.bulkUpdateEsevaiStatus = async (req, res, next) => {
  try {
    const { serviceIds } = req.body;
    
    // Set all services to isEsevai: false
    await Service.updateMany({}, { isEsevai: false });
    
    // Set selected services to isEsevai: true
    if (serviceIds && serviceIds.length > 0) {
      await Service.updateMany({ _id: { $in: serviceIds } }, { isEsevai: true });
    }

    res.status(200).json({ 
      success: true, 
      message: 'ESevai services configured successfully' 
    });
  } catch (err) {
    next(err);
  }
};
