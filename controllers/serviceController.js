const Service = require('../models/Service');
const AuditLog = require('../models/AuditLog');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadFile, getSignedDownloadUrl, generateS3Key } = require('../utils/s3Storage');

// @desc    Get all active services
// @route   GET /api/services
// @access  Private
exports.getServices = async (req, res, next) => {
  try {
    const services = await Service.find({ status: 'active' });
    const signedServices = await Promise.all(services.map(async srv => {
      const srvObj = srv.toObject();
      if (srvObj.storage === 's3' && srvObj.imageKey) {
        try {
          srvObj.imageUrl = await getSignedDownloadUrl(srvObj.imageKey, 900);
        } catch (err) {
          console.error(`Failed to sign S3 service image: ${srvObj.imageKey}`, err);
        }
      }
      return srvObj;
    }));
    res.status(200).json({ success: true, count: signedServices.length, data: signedServices });
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
    const signedServices = await Promise.all(services.map(async srv => {
      const srvObj = srv.toObject();
      if (srvObj.storage === 's3' && srvObj.imageKey) {
        try {
          srvObj.imageUrl = await getSignedDownloadUrl(srvObj.imageKey, 900);
        } catch (err) {
          console.error(`Failed to sign S3 service image: ${srvObj.imageKey}`, err);
        }
      }
      return srvObj;
    }));
    res.status(200).json({ success: true, data: signedServices });
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
    const serviceId = new mongoose.Types.ObjectId();
    serviceData._id = serviceId;
 
    // Handle Image
    if (req.file) {
      const uniqueKey = generateS3Key('services', serviceId.toString(), req.file.originalname);
      await uploadFile({
        buffer: req.file.buffer,
        key: uniqueKey,
        contentType: req.file.mimetype
      });
      serviceData.imageUrl = `api/services/images/${serviceId}`; // Placeholder fallback
      serviceData.imageKey = uniqueKey;
      serviceData.storage = 's3';
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
      const uniqueKey = generateS3Key('services', service._id.toString(), req.file.originalname);
      await uploadFile({
        buffer: req.file.buffer,
        key: uniqueKey,
        contentType: req.file.mimetype
      });
      updateData.imageUrl = `api/services/images/${service._id}`; // Placeholder fallback
      updateData.imageKey = uniqueKey;
      updateData.storage = 's3';
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
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'delete',
      targetCollection: 'services',
      targetId: service._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'deleted' }
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
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'update',
      targetCollection: 'services',
      targetId: service._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'restored' }
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
