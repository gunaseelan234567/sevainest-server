const mongoose = require('mongoose');
const InstantService = require('../models/InstantService');
const InstantServiceTransaction = require('../models/InstantServiceTransaction');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const AuditLog = require('../models/AuditLog');
const neoapiClient = require('../services/neoapi/neoapiClient');
const { uploadFile, getSignedDownloadUrl, generateS3Key } = require('../utils/s3Storage');
const logger = require('../utils/logger');

// Path resolution helper for nested results
function resolvePath(obj, path) {
  if (!obj || !path) return undefined;
  const cleanPath = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = cleanPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

// Path setter helper for nested results reconstruction
function setPath(obj, path, value) {
  const cleanPath = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = cleanPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = isNaN(parts[i + 1]) ? {} : [];
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

// Masking utility for security compliance (prevents saving full Aadhaar/PAN/Bank numbers)
function maskSensitiveValue(value) {
  if (typeof value !== 'string') return value;
  const str = value.trim();
  if (str.length <= 4) return '*'.repeat(str.length);
  return '*'.repeat(str.length - 4) + str.slice(-4);
}

function maskSensitiveData(data) {
  if (!data) return data;
  const sensitiveKeys = ['aadhaar', 'pan', 'account', 'ifsc', 'gstin', 'dob', 'dateofbirth', 'mobile', 'phone'];
  
  if (typeof data === 'object') {
    const masked = Array.isArray(data) ? [] : {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(k => lowerKey.includes(k))) {
          masked[key] = maskSensitiveValue(data[key]);
        } else if (typeof data[key] === 'object' && data[key] !== null) {
          masked[key] = maskSensitiveData(data[key]);
        } else {
          masked[key] = data[key];
        }
      }
    }
    return masked;
  }
  return data;
}

// Helper to sign S3 image URL for a service configuration
const signServiceImage = async (srv) => {
  const srvObj = srv.toObject ? srv.toObject() : srv;
  if (srvObj.storage === 's3' && srvObj.imageKey) {
    try {
      srvObj.imageUrl = await getSignedDownloadUrl(srvObj.imageKey, 900);
    } catch (err) {
      logger.error(`Failed to sign S3 instant service image: ${srvObj.imageKey} - ${err.message}`);
    }
  }
  return srvObj;
};

// Validate options schema for dynamic select parameter configurations
const validateParameters = (parameters) => {
  if (!Array.isArray(parameters)) return;
  for (const param of parameters) {
    if (param.type === 'select') {
      if (!param.options || !Array.isArray(param.options) || param.options.length === 0) {
        throw new Error(`Dropdown parameter '${param.label || param.name}' must contain at least one option.`);
      }

      const apiValues = new Set();
      const labels = new Set();

      for (const opt of param.options) {
        if (!opt || typeof opt !== 'object') {
          throw new Error(`Invalid option structure for parameter '${param.label || param.name}'.`);
        }

        const label = opt.label ? String(opt.label).trim() : '';
        const value = opt.value ? String(opt.value).trim() : '';

        if (!label || !value) {
          throw new Error(`Option Display Label and API Value cannot be empty for parameter '${param.label || param.name}'.`);
        }

        if (apiValues.has(value)) {
          throw new Error(`Duplicate API Value '${value}' for dropdown parameter '${param.label || param.name}'.`);
        }
        if (labels.has(label)) {
          throw new Error(`Duplicate Display Label '${label}' for dropdown parameter '${param.label || param.name}'.`);
        }

        apiValues.add(value);
        labels.add(label);
      }
    }
  }
};

// ==========================================
// ADMIN PORTAL CONTROLLERS
// ==========================================

// @desc    Create new Instant Service
// @route   POST /api/instant-services
// @access  Private/Admin
exports.createInstantService = async (req, res, next) => {
  try {
    const serviceData = { ...req.body };
    const serviceId = new mongoose.Types.ObjectId();
    serviceData._id = serviceId;

    // Handle uploaded file
    if (req.file) {
      const uniqueKey = generateS3Key('instant-services', serviceId.toString(), req.file.originalname);
      await uploadFile({
        buffer: req.file.buffer,
        key: uniqueKey,
        contentType: req.file.mimetype,
      });
      serviceData.imageUrl = `api/instant-services/images/${serviceId}`;
      serviceData.imageKey = uniqueKey;
      serviceData.storage = 's3';
    }

    // Multer/FormData might stringify arrays/JSON
    if (typeof serviceData.parameters === 'string') {
      serviceData.parameters = JSON.parse(serviceData.parameters);
    }

    if (serviceData.parameters) {
      validateParameters(serviceData.parameters);
    }

    if (typeof serviceData.responseFields === 'string') {
      serviceData.responseFields = JSON.parse(serviceData.responseFields);
    }

    if (serviceData.serviceAmount) {
      serviceData.serviceAmount = Number(serviceData.serviceAmount);
    }

    const service = await InstantService.create(serviceData);

    // Create Audit Log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'create',
      targetCollection: 'instant-services',
      targetId: service._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: service.toObject(),
    });

    res.status(201).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all Instant Services (Admin only)
// @route   GET /api/instant-services/all
// @access  Private/Admin
exports.getAllInstantServices = async (req, res, next) => {
  try {
    const services = await InstantService.find();
    const signedServices = await Promise.all(services.map(signServiceImage));
    res.status(200).json({ success: true, data: signedServices });
  } catch (err) {
    next(err);
  }
};

// @desc    Update Instant Service
// @route   PUT /api/instant-services/:id
// @access  Private/Admin
exports.updateInstantService = async (req, res, next) => {
  try {
    let service = await InstantService.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Instant service not found' });
    }

    const updateData = { ...req.body };

    // Handle new S3 image if uploaded
    if (req.file) {
      const uniqueKey = generateS3Key('instant-services', service._id.toString(), req.file.originalname);
      await uploadFile({
        buffer: req.file.buffer,
        key: uniqueKey,
        contentType: req.file.mimetype,
      });
      updateData.imageUrl = `api/instant-services/images/${service._id}`;
      updateData.imageKey = uniqueKey;
      updateData.storage = 's3';
    }

    if (typeof updateData.parameters === 'string') {
      updateData.parameters = JSON.parse(updateData.parameters);
    }

    if (updateData.parameters) {
      validateParameters(updateData.parameters);
    }

    if (typeof updateData.responseFields === 'string') {
      updateData.responseFields = JSON.parse(updateData.responseFields);
    }

    if (updateData.serviceAmount !== undefined) {
      updateData.serviceAmount = Number(updateData.serviceAmount);
    }

    const oldData = service.toObject();

    service = await InstantService.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    // Create Audit Log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'update',
      targetCollection: 'instant-services',
      targetId: service._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      oldData,
      newData: service.toObject(),
    });

    res.status(200).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete Instant Service (Soft-delete)
// @route   DELETE /api/instant-services/:id
// @access  Private/Admin
exports.deleteInstantService = async (req, res, next) => {
  try {
    const service = await InstantService.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Instant service not found' });
    }

    service.isDeleted = true;
    service.deletedAt = new Date();
    await service.save();

    // Create Audit Log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'delete',
      targetCollection: 'instant-services',
      targetId: service._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'deleted' },
    });

    logger.log(`[AUDIT] ADMIN_DELETE_INSTANT_SERVICE SUCCESS: ID: ${service._id} by Admin: ${req.user.id}`);

    res.status(200).json({ success: true, message: 'Instant service soft-deleted successfully', data: {} });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore Soft-Deleted Instant Service
// @route   PATCH /api/instant-services/:id/restore
// @access  Private/Admin
exports.restoreInstantService = async (req, res, next) => {
  try {
    // Search with isDeleted: true to locate soft-deleted record
    const service = await InstantService.findOne({ _id: req.params.id, isDeleted: true });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Soft-deleted instant service not found' });
    }

    service.isDeleted = false;
    service.deletedAt = null;
    await service.save();

    // Create Audit Log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'update',
      targetCollection: 'instant-services',
      targetId: service._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'restored' },
    });

    logger.log(`[AUDIT] ADMIN_RESTORE_INSTANT_SERVICE SUCCESS: ID: ${service._id} by Admin: ${req.user.id}`);

    res.status(200).json({ success: true, message: 'Instant service restored successfully', data: service });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// AGENT PORTAL CONTROLLERS
// ==========================================

// @desc    Get all active Instant Services (Agent view)
// @route   GET /api/instant-services
// @access  Private/Agent
exports.getActiveInstantServices = async (req, res, next) => {
  try {
    const services = await InstantService.find({ status: 'active' });
    const signedServices = await Promise.all(services.map(signServiceImage));
    res.status(200).json({ success: true, count: signedServices.length, data: signedServices });
  } catch (err) {
    next(err);
  }
};

// @desc    Execute Instant Verification via NeoAPI
// @route   POST /api/instant-services/:id/execute
// @access  Private/Agent
exports.executeInstantService = async (req, res, next) => {
  let user;
  let service;
  let transaction;
  const { formData } = req.body;

  try {
    // 1. Authoritative check of Instant Service
    service = await InstantService.findById(req.params.id);
    if (!service || service.status !== 'active') {
      return res.status(400).json({ success: false, message: 'This service is inactive or not found.' });
    }

    // 2. Validate input dynamic parameters
    const paramsList = service.parameters || [];
    const executionData = {};
    for (const param of paramsList) {
      const val = formData ? formData[param.name] : undefined;
      if (param.required && (val === undefined || val === null || val === '')) {
        return res.status(400).json({ success: false, message: `Field '${param.label}' is required.` });
      }
      if (val !== undefined && val !== null && val !== '') {
        const trimmedVal = String(val).trim();
        if (param.type === 'select' && param.options && param.options.length > 0) {
          const allowedValues = param.options.map(opt => (opt && typeof opt === 'object' ? opt.value : opt));
          if (!allowedValues.includes(trimmedVal)) {
            return res.status(400).json({
              success: false,
              message: `Invalid value selected for field '${param.label}'.`
            });
          }
        }
        executionData[param.name] = trimmedVal;
      }
    }

    // 3. Perform atomic wallet balance checks and pre-deductions
    user = await User.findOneAndUpdate(
      { _id: req.user.id, walletBalance: { $gte: service.serviceAmount }, isDeleted: { $ne: true } },
      { $inc: { walletBalance: -service.serviceAmount } },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }

    // 4. Create pending transaction log
    transaction = await InstantServiceTransaction.create({
      agentId: req.user.id,
      instantServiceId: service._id,
      serviceName: service.name,
      amount: service.serviceAmount,
      requestData: maskSensitiveData(executionData),
      provider: service.provider,
      status: 'pending',
    });

    // 5. Call secure NeoAPI backend integration layer
    let responsePayload;
    try {
      responsePayload = await neoapiClient.executeService(service.endpoint, service.method, executionData);
      if (responsePayload && (responsePayload.success === false || responsePayload.status === 'failed' || responsePayload.error)) {
        throw new Error(responsePayload.message || responsePayload.error || 'API provider returned a verification failure.');
      }
    } catch (apiError) {
      // 6. ROLLBACK: Refund wallet balance on NeoAPI execution failures
      await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: service.serviceAmount } });

      transaction.status = 'failed';
      transaction.errorCode = 'PROVIDER_EXECUTION_FAILED';
      transaction.errorMessage = apiError.message || 'API provider failed to execute request.';
      transaction.completedAt = new Date();
      await transaction.save();

      return res.status(502).json({
        success: false,
        message: transaction.errorMessage,
        code: transaction.errorCode,
      });
    }

    // 7. Success logic: Process response fields, parse documents and save references
    const { processDocument } = require('../services/file/documentProcessor');
    const sanitizedResult = {};
    const responseFields = service.responseFields || [];

    for (const field of responseFields) {
      const val = resolvePath(responsePayload, field.key);
      if (val === undefined || val === null) {
        continue;
      }

      if (['text', 'number', 'date'].includes(field.type)) {
        setPath(sanitizedResult, field.key, val);
      } else if (['file', 'image'].includes(field.type)) {
        try {
          const docRef = await processDocument({
            transactionId: transaction._id,
            providerField: field.key,
            label: field.label,
            configuredType: field.type,
            configuredFileType: field.fileType,
            value: val
          });
          setPath(sanitizedResult, field.key, docRef);
        } catch (procErr) {
          // Rollback wallet balance on document storage failure
          await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: service.serviceAmount } });

          transaction.status = 'failed';
          transaction.errorCode = 'FILE_PROCESSING_FAILED';
          transaction.errorMessage = `Document processing failed for '${field.label}': ${procErr.message}`;
          transaction.completedAt = new Date();
          await transaction.save();

          return res.status(502).json({
            success: false,
            message: transaction.errorMessage,
            code: transaction.errorCode,
          });
        }
      } else if (field.type === 'file_array') {
        try {
          if (!Array.isArray(val)) {
            throw new Error(`Expected array for file_array type field '${field.key}'`);
          }
          const refs = [];
          for (let idx = 0; idx < val.length; idx++) {
            const valItem = val[idx];
            let fileVal = valItem;
            if (typeof valItem === 'object' && valItem !== null) {
              fileVal = valItem.base64 || valItem.url || valItem.value || valItem.data || valItem;
            }

            const docRef = await processDocument({
              transactionId: transaction._id,
              providerField: `${field.key}[${idx}]`,
              label: `${field.label} - Part ${idx + 1}`,
              configuredType: 'file',
              configuredFileType: field.fileType,
              value: fileVal
            });
            refs.push(docRef);
          }
          setPath(sanitizedResult, field.key, refs);
        } catch (procErr) {
          // Rollback wallet balance
          await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: service.serviceAmount } });

          transaction.status = 'failed';
          transaction.errorCode = 'FILE_PROCESSING_FAILED';
          transaction.errorMessage = `Array document processing failed for '${field.label}': ${procErr.message}`;
          transaction.completedAt = new Date();
          await transaction.save();

          return res.status(502).json({
            success: false,
            message: transaction.errorMessage,
            code: transaction.errorCode,
          });
        }
      }
    }

    transaction.status = 'success';
    // Store sanitizedResult instead of raw base64 or URL strings
    transaction.result = maskSensitiveData(sanitizedResult);
    transaction.providerReference = responsePayload.referenceId || '';
    transaction.completedAt = new Date();
    await transaction.save();

    // 8. Log the debit log in WalletTransaction
    await WalletTransaction.create({
      agentId: req.user.id,
      type: 'debit',
      amount: service.serviceAmount,
      reason: `Instant Service: ${service.name} (Txn: ${transaction._id})`,
      performedBy: req.user.id,
      balanceAfter: user.walletBalance,
    });

    res.status(200).json({
      success: true,
      message: 'Service executed successfully',
      data: sanitizedResult,
      transactionId: transaction._id,
    });
  } catch (err) {
    // If balance was deducted but process died before neoapi Client was run
    if (user && (!transaction || transaction.status === 'pending')) {
      await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: service.serviceAmount } });
      if (transaction) {
        transaction.status = 'failed';
        transaction.errorCode = 'SERVER_ERROR';
        transaction.errorMessage = err.message || 'Server encountered an error while processing request.';
        transaction.completedAt = new Date();
        await transaction.save();
      }
    }
    next(err);
  }
};

// @desc    Get Agent Instant Services history
// @route   GET /api/instant-services/history
// @access  Private/Agent
exports.getAgentHistory = async (req, res, next) => {
  try {
    const transactions = await InstantServiceTransaction.find({ agentId: req.user.id }).populate('instantServiceId').sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single transaction detail
// @route   GET /api/instant-services/history/:id
// @access  Private/Agent
exports.getAgentHistoryDetail = async (req, res, next) => {
  try {
    const transaction = await InstantServiceTransaction.findOne({ _id: req.params.id, agentId: req.user.id }).populate('instantServiceId');
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction record not found' });
    }
    res.status(200).json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// CATEGORY CONTROLLERS
// ==========================================

// @desc    Get all Instant Service Categories
// @route   GET /api/instant-services/categories/all
// @access  Private
exports.getCategories = async (req, res, next) => {
  try {
    const InstantServiceCategory = require('../models/InstantServiceCategory');
    const categories = await InstantServiceCategory.find().sort({ name: 1 });
    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
};

// @desc    Create Instant Service Category
// @route   POST /api/instant-services/categories
// @access  Private/Admin
exports.createCategory = async (req, res, next) => {
  try {
    const InstantServiceCategory = require('../models/InstantServiceCategory');
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Please provide a category name' });
    }

    const nameTrimmed = name.trim();
    // Case-insensitive duplicate check
    const existing = await InstantServiceCategory.findOne({ name: { $regex: new RegExp(`^${nameTrimmed}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }

    const category = await InstantServiceCategory.create({ name: nameTrimmed });

    // Create Audit Log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'create',
      targetCollection: 'instant-service-categories',
      targetId: category._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: category.toObject(),
    });

    res.status(201).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
};

// @desc    Update Instant Service Category
// @route   PUT /api/instant-services/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res, next) => {
  try {
    const InstantServiceCategory = require('../models/InstantServiceCategory');
    const { name, status } = req.body;
    let category = await InstantServiceCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const oldData = category.toObject();
    const updateData = {};

    if (name !== undefined) {
      const nameTrimmed = name.trim();
      if (!nameTrimmed) {
        return res.status(400).json({ success: false, message: 'Please provide a category name' });
      }

      // Check duplicates excluding this one
      const existing = await InstantServiceCategory.findOne({
        _id: { $ne: req.params.id },
        name: { $regex: new RegExp(`^${nameTrimmed}$`, 'i') }
      });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Category name already exists' });
      }
      updateData.name = nameTrimmed;
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      updateData.status = status;
    }

    category = await InstantServiceCategory.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });

    // If name changed, update all services referencing the old name
    if (name !== undefined && oldData.name !== category.name) {
      await InstantService.updateMany(
        { category: oldData.name },
        { category: category.name }
      );
    }

    // Create Audit Log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'update',
      targetCollection: 'instant-service-categories',
      targetId: category._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      oldData,
      newData: category.toObject(),
    });

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete Instant Service Category
// @route   DELETE /api/instant-services/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res, next) => {
  try {
    const InstantServiceCategory = require('../models/InstantServiceCategory');
    const category = await InstantServiceCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const oldData = category.toObject();

    // Reset services using this category to 'Other'
    await InstantService.updateMany(
      { category: category.name },
      { category: 'Other' }
    );

    await InstantServiceCategory.findByIdAndDelete(req.params.id);

    // Create Audit Log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'delete',
      targetCollection: 'instant-service-categories',
      targetId: category._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      oldData,
    });

    res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Get authorized temporary presigned S3 download URL for a transaction file
// @route   GET /api/instant-services/transactions/:transactionId/files/:fileId
// @access  Private
exports.getTransactionFile = async (req, res, next) => {
  try {
    const InstantServiceFile = require('../models/InstantServiceFile');
    const { transactionId, fileId } = req.params;

    // 1. Fetch file record
    const fileRecord = await InstantServiceFile.findById(fileId);
    if (!fileRecord) {
      return res.status(404).json({ success: false, message: 'File record not found' });
    }

    // 2. Verify file belongs to transaction
    if (fileRecord.transactionId.toString() !== transactionId) {
      return res.status(400).json({ success: false, message: 'File does not belong to this transaction' });
    }

    // 3. Fetch transaction
    const transaction = await InstantServiceTransaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // 4. Authorize agent or admin access
    const isOwner = transaction.agentId.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You are not authorized to access this file' });
    }

    // 5. Generate presigned GET URL (expires in 120 seconds)
    const expiresIn = 120;
    const presignedUrl = await getSignedDownloadUrl(fileRecord.storageKey, expiresIn);

    res.status(200).json({
      success: true,
      url: presignedUrl,
      expiresIn
    });
  } catch (err) {
    next(err);
  }
};
