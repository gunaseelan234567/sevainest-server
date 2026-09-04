const mongoose = require('mongoose');
const CardProcessingProfile = require('../models/CardProcessingProfile');
const CardProcessingJob = require('../models/CardProcessingJob');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { loadPdf, getPageCount, getPageDimensions, isEncrypted, decryptPdf } = require('../services/cardProcessor/pdfRenderer');
const { isCropInBounds, normalizeCrop } = require('../services/cardProcessor/cropEngine');
const { processJob, processUnlockedJob } = require('../services/cardProcessor/cardProcessor');
const { generateCardPdf } = require('../services/cardProcessor/outputGenerator');
const { createProfileSchema, updateProfileSchema } = require('../services/cardProcessor/validators');
const { uploadFile, deleteFile, getSignedDownloadUrl, generateS3Key } = require('../utils/s3Storage');
const { logAdminAction } = require('../utils/auditLogger');
const logger = require('../utils/logger');

const validateCropConfig = (profileData) => {
  const { crop, cropBack, layoutMode, source, status } = profileData;
  const pageWidth = source?.pageWidth;
  const pageHeight = source?.pageHeight;

  if (!pageWidth || !pageHeight) {
    return true; // No sample PDF loaded yet (or draft stage with zero pageWidth/pageHeight)
  }

  // Allow temporary 1x1 placeholder crops only for draft profiles during staging/upload
  const isPlaceholderFront = crop && crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
  if (isPlaceholderFront && status === 'draft') {
    return true;
  }

  // Validate front crop bounds
  if (crop) {
    const { x, y, width, height } = crop;
    // x >= 0, y >= 0, width > 1, height > 1, x + width <= pdfPageWidth + epsilon
    if (x < 0 || y < 0 || width <= 1 || height <= 1 || (x + width) > pageWidth + 0.5 || (y + height) > pageHeight + 0.5) {
      return false;
    }
  }

  // Validate back crop bounds
  if (layoutMode === 'double' && cropBack && cropBack.width > 5) {
    const { x, y, width, height } = cropBack;
    if (x < 0 || y < 0 || width <= 1 || height <= 1 || (x + width) > pageWidth + 0.5 || (y + height) > pageHeight + 0.5) {
      return false;
    }
  }

  return true;
};

// ─── ADMIN CONTROLLERS ───────────────────────────────────────────────────────

// @desc    Get all card processing profiles
// @route   GET /api/admin/card-processing
// @access  Private/Admin
exports.getProfiles = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const profiles = await CardProcessingProfile.find(query).sort('-createdAt');

    // Sign sample and cover image URLs if they exist
    const signedProfiles = await Promise.all(
      profiles.map(async (profile) => {
        const obj = profile.toObject();
        if (obj.sampleFile && obj.sampleFile.key) {
          try {
            obj.sampleFile.url = await getSignedDownloadUrl(obj.sampleFile.key, 900);
          } catch (err) {
            logger.error(`Failed to sign S3 sample file key: ${obj.sampleFile.key}`, err);
          }
        }
        if (obj.coverImage && obj.coverImage.key) {
          try {
            obj.coverImage.url = await getSignedDownloadUrl(obj.coverImage.key, 900);
          } catch (err) {
            logger.error(`Failed to sign S3 cover image key: ${obj.coverImage.key}`, err);
          }
        }
        return obj;
      })
    );

    res.status(200).json({
      success: true,
      count: signedProfiles.length,
      data: signedProfiles,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single card processing profile
// @route   GET /api/admin/card-processing/:id
// @access  Private/Admin
exports.getProfile = async (req, res, next) => {
  try {
    const profile = await CardProcessingProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Card profile not found' });
    }

    const obj = profile.toObject();
    if (obj.sampleFile && obj.sampleFile.key) {
      try {
        obj.sampleFile.url = await getSignedDownloadUrl(obj.sampleFile.key, 900);
      } catch (err) {
        logger.error(`Failed to sign S3 sample file key: ${obj.sampleFile.key}`, err);
      }
    }
    if (obj.coverImage && obj.coverImage.key) {
      try {
        obj.coverImage.url = await getSignedDownloadUrl(obj.coverImage.key, 900);
      } catch (err) {
        logger.error(`Failed to sign S3 cover image key: ${obj.coverImage.key}`, err);
      }
    }

    res.status(200).json({
      success: true,
      data: obj,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a card processing profile
// @route   POST /api/admin/card-processing
// @access  Private/Admin
exports.createProfile = async (req, res, next) => {
  try {
    // Validate request body
    const validatedData = createProfileSchema.parse(req.body);
    validatedData.createdBy = req.user._id;

    // Check crop boundaries before saving
    if (!validateCropConfig(validatedData)) {
      return res.status(400).json({ success: false, message: 'Crop configuration is outside the PDF page.' });
    }

    // Check code uniqueness
    const existing = await CardProcessingProfile.findOne({ code: validatedData.code });
    if (existing) {
      return res.status(400).json({ success: false, message: `Profile code '${validatedData.code}' is already in use` });
    }

    const profile = await CardProcessingProfile.create(validatedData);
    console.log("ADMIN SAVE: Saved database crop:", profile.crop);

    await logAdminAction({
      req,
      actionType: 'create',
      targetCollection: 'CardProcessingProfile',
      targetId: profile._id.toString(),
      newData: profile.toObject(),
    });

    res.status(201).json({
      success: true,
      data: profile,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      const errorMsg = err.errors[0]?.message || 'Validation failed';
      return res.status(400).json({ success: false, message: errorMsg, errors: err.errors });
    }
    next(err);
  }
};

// @desc    Update a card processing profile
// @route   PUT /api/admin/card-processing/:id
// @access  Private/Admin
exports.updateProfile = async (req, res, next) => {
  try {
    let profile = await CardProcessingProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Card profile not found' });
    }

    // Validate request body
    const validatedData = updateProfileSchema.parse(req.body);

    // Merge updates with existing profile to check full bounds validation
    const merged = {
      source: { ...profile.source, ...validatedData.source },
      crop: { ...profile.crop, ...validatedData.crop },
      cropBack: { ...profile.cropBack, ...validatedData.cropBack },
      layoutMode: validatedData.layoutMode || profile.layoutMode,
      status: validatedData.status || profile.status
    };

    if (!validateCropConfig(merged)) {
      return res.status(400).json({ success: false, message: 'Crop configuration is outside the PDF page.' });
    }

    // If code is changing, check uniqueness
    if (validatedData.code && validatedData.code !== profile.code) {
      const existing = await CardProcessingProfile.findOne({ code: validatedData.code });
      if (existing) {
        return res.status(400).json({ success: false, message: `Profile code '${validatedData.code}' is already in use` });
      }
    }

    // Check if configuration parameters are modified (crop, output, source dimensions, status)
    // If so, increment the version
    const oldData = profile.toObject();
    let isConfigModified = false;
    
    if (validatedData.crop || validatedData.output || validatedData.source) {
      isConfigModified = true;
    }

    if (isConfigModified) {
      validatedData.version = (profile.version || 1) + 1;
    }

    // Apply updates
    Object.assign(profile, validatedData);
    await profile.save();
    console.log("ADMIN SAVE: Saved database crop:", profile.crop);

    await logAdminAction({
      req,
      actionType: 'update',
      targetCollection: 'CardProcessingProfile',
      targetId: profile._id.toString(),
      oldData,
      newData: profile.toObject(),
    });

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      const errorMsg = err.errors[0]?.message || 'Validation failed';
      return res.status(400).json({ success: false, message: errorMsg, errors: err.errors });
    }
    next(err);
  }
};

// @desc    Upload sample PDF for profile
// @route   POST /api/admin/card-processing/:id/sample
// @access  Private/Admin
exports.uploadSample = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a sample PDF file' });
    }

    let profile = await CardProcessingProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Card profile not found' });
    }

    // Process PDF and extract metadata (page count, dimensions of first page)
    const pdfDoc = await loadPdf(req.file.buffer);
    const pagesCount = getPageCount(pdfDoc);
    const dimensions = getPageDimensions(pdfDoc, 1);

    // Delete old sample file from S3 if it exists
    if (profile.sampleFile && profile.sampleFile.key) {
      try {
        await deleteFile(profile.sampleFile.key);
      } catch (err) {
        logger.error(`Failed to delete old sample file ${profile.sampleFile.key} from S3`, err);
      }
    }

    // Upload new sample file to S3
    const sampleKey = generateS3Key('card-processing/profiles', `${profile._id}/samples`, req.file.originalname);
    await uploadFile({
      buffer: req.file.buffer,
      key: sampleKey,
      contentType: req.file.mimetype,
    });

    const oldData = profile.toObject();

    // Update profile
    profile.sampleFile = {
      key: sampleKey,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    };
    profile.source = {
      pageNumber: 1,
      pageWidth: dimensions.width,
      pageHeight: dimensions.height,
      pagesCount: pagesCount,
    };
    // Initialize default crop if it hasn't been set yet
    if (!profile.crop || profile.crop.width === 0) {
      profile.crop = {
        x: 0,
        y: 0,
        width: dimensions.width,
        height: dimensions.height,
      };
    }
    await profile.save();

    await logAdminAction({
      req,
      actionType: 'update',
      targetCollection: 'CardProcessingProfile',
      targetId: profile._id.toString(),
      oldData,
      newData: profile.toObject(),
    });

    const signedUrl = await getSignedDownloadUrl(sampleKey, 900);

    res.status(200).json({
      success: true,
      message: 'Sample PDF uploaded successfully',
      data: {
        profile,
        url: signedUrl,
        pagesCount,
        dimensions,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Upload card cover image for profile
// @route   POST /api/admin/card-processing/:id/cover
// @access  Private/Admin
exports.uploadCoverImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a card cover image' });
    }

    let profile = await CardProcessingProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Card profile not found' });
    }

    // Delete old cover image from S3 if present
    if (profile.coverImage && profile.coverImage.key) {
      try {
        await deleteFile(profile.coverImage.key);
      } catch (err) {
        logger.error(`Failed to delete old cover image ${profile.coverImage.key} from S3`, err);
      }
    }

    // Upload new cover image file to S3
    const coverKey = generateS3Key('card-processing/profiles', `${profile._id}/cover`, req.file.originalname);
    await uploadFile({
      buffer: req.file.buffer,
      key: coverKey,
      contentType: req.file.mimetype,
    });

    const oldData = profile.toObject();

    profile.coverImage = {
      key: coverKey,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    };
    await profile.save();

    await logAdminAction({
      req,
      actionType: 'update',
      targetCollection: 'CardProcessingProfile',
      targetId: profile._id.toString(),
      oldData,
      newData: profile.toObject(),
    });

    const signedUrl = await getSignedDownloadUrl(coverKey, 900);
    const updatedObj = profile.toObject();
    updatedObj.coverImage.url = signedUrl;

    res.status(200).json({
      success: true,
      message: 'Card cover image uploaded successfully',
      data: updatedObj,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get live crop preview of a profile configuration
// @route   POST /api/admin/card-processing/:id/preview
// @access  Private/Admin
exports.previewConfig = async (req, res, next) => {
  try {
    const profile = await CardProcessingProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Card profile not found' });
    }

    if (!profile.sampleFile || !profile.sampleFile.key) {
      return res.status(400).json({ success: false, message: 'No sample PDF uploaded for this profile yet' });
    }

    // Download sample PDF buffer
    const { getObject: getS3Object } = require('../utils/s3Storage');
    const s3Response = await getS3Object(profile.sampleFile.key);
    
    // Read stream to buffer
    const chunks = [];
    const stream = s3Response.Body;
    const sampleBuffer = await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // Use query parameters crop box or profile crop box
    const config = {
      layoutMode: req.body.layoutMode || profile.layoutMode || 'single',
      source: {
        pageNumber: parseInt(req.body.pageNumber) || profile.source.pageNumber || 1,
      },
      crop: req.body.crop ? normalizeCrop(req.body.crop) : profile.crop,
      cropBack: req.body.cropBack ? {
        ...normalizeCrop(req.body.cropBack),
        pageNumber: parseInt(req.body.cropBack.pageNumber) || 1
      } : profile.cropBack,
      output: req.body.output || profile.output,
    };

    // Run PDF generator to get cropped output buffer
    const previewPdfBuffer = await generateCardPdf(sampleBuffer, config);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', previewPdfBuffer.length);
    res.send(previewPdfBuffer);
  } catch (err) {
    next(err);
  }
};

// @desc    Publish/Activate a card processing profile
// @route   POST /api/admin/card-processing/:id/publish
// @access  Private/Admin
exports.publishProfile = async (req, res, next) => {
  try {
    const profile = await CardProcessingProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Card profile not found' });
    }

    // Run publish-ready validations
    if (!profile.sampleFile || !profile.sampleFile.key) {
      return res.status(400).json({ success: false, message: 'Sample PDF is required before publishing' });
    }

    const totalPages = profile.source.pagesCount || 1;
    if (profile.source.pageNumber < 1 || profile.source.pageNumber > totalPages) {
      return res.status(400).json({
        success: false,
        message: 'Selected page does not exist.',
      });
    }

    if (profile.layoutMode === 'double' && profile.cropBack && profile.cropBack.width > 5) {
      const backPageNum = profile.cropBack.pageNumber || 1;
      if (backPageNum < 1 || backPageNum > totalPages) {
        return res.status(400).json({
          success: false,
          message: 'Selected page does not exist.',
        });
      }
    }

    const pageDimensions = {
      width: profile.source.pageWidth,
      height: profile.source.pageHeight,
    };

    if (!isCropInBounds(profile.crop, pageDimensions)) {
      return res.status(400).json({
        success: false,
        message: 'Crop configuration is outside the PDF page.',
      });
    }

    if (profile.layoutMode === 'double' && profile.cropBack && profile.cropBack.width > 5) {
      if (!isCropInBounds(profile.cropBack, pageDimensions)) {
        return res.status(400).json({
          success: false,
          message: 'Crop configuration is outside the PDF page.',
        });
      }
    }

    if (profile.output.width <= 0 || profile.output.height <= 0) {
      return res.status(400).json({ success: false, message: 'Output width and height must be positive values' });
    }

    const oldData = profile.toObject();
    profile.status = 'active';
    await profile.save();

    await logAdminAction({
      req,
      actionType: 'update',
      targetCollection: 'CardProcessingProfile',
      targetId: profile._id.toString(),
      oldData,
      newData: profile.toObject(),
    });

    res.status(200).json({
      success: true,
      message: 'Card profile published and activated successfully',
      data: profile,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft Delete a card processing profile
// @route   DELETE /api/admin/card-processing/:id
// @access  Private/Admin
exports.deleteProfile = async (req, res, next) => {
  try {
    const profile = await CardProcessingProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Card profile not found' });
    }

    const oldData = profile.toObject();

    // Soft delete and release unique code namespace for future profile recreations
    profile.isDeleted = true;
    profile.deletedAt = new Date();
    profile.status = 'inactive';
    profile.code = `${profile.code}-deleted-${Date.now()}`;
    await profile.save();

    await logAdminAction({
      req,
      actionType: 'delete',
      targetCollection: 'CardProcessingProfile',
      targetId: profile._id.toString(),
      oldData,
      newData: profile.toObject(),
    });

    res.status(200).json({
      success: true,
      message: 'Card profile deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

// ─── AGENT CONTROLLERS ───────────────────────────────────────────────────────

// @desc    Get active card profiles
// @route   GET /api/agent/card-processing/profiles
// @access  Private/Agent
exports.getActiveProfiles = async (req, res, next) => {
  try {
    const profiles = await CardProcessingProfile.find({ status: 'active' }).sort('name');

    const signedProfiles = await Promise.all(
      profiles.map(async (profile) => {
        const obj = profile.toObject();
        if (obj.coverImage && obj.coverImage.key) {
          try {
            obj.coverImage.url = await getSignedDownloadUrl(obj.coverImage.key, 900);
          } catch (err) {
            logger.error(`Failed to sign S3 cover image key: ${obj.coverImage.key}`, err);
          }
        }
        return obj;
      })
    );

    res.status(200).json({
      success: true,
      count: signedProfiles.length,
      data: signedProfiles,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Upload original PDF and run cropping/scaling job
// @route   POST /api/agent/card-processing/process
// @access  Private/Agent
exports.processPdf = async (req, res, next) => {
  try {
    const { profileId } = req.body;

    if (!profileId) {
      return res.status(400).json({ success: false, message: 'Card profile ID is required' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a PDF file to process' });
    }

    const profile = await CardProcessingProfile.findOne({ _id: profileId, status: 'active' });
    if (!profile) {
      return res.status(400).json({ success: false, message: 'Selected card type is not active or invalid' });
    }

    // Check card processing fee & agent wallet balance
    const cardPrice = Number(profile.price) || 0;
    if (cardPrice > 0) {
      const agentUser = await User.findById(req.user._id);
      if (!agentUser) {
        return res.status(404).json({ success: false, message: 'Agent account not found' });
      }

      const currentBalance = Number(agentUser.walletBalance) || 0;
      if (currentBalance < cardPrice) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Processing ${profile.name} requires ₹${cardPrice.toFixed(2)}, but your current wallet balance is ₹${currentBalance.toFixed(2)}. Please recharge your wallet.`
        });
      }

      // Deduct wallet balance
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $inc: { walletBalance: -cardPrice } },
        { new: true }
      );

      // Create Wallet Transaction log
      await WalletTransaction.create({
        agentId: req.user._id,
        type: 'debit',
        amount: cardPrice,
        reason: `ID Maker Fee: ${profile.name}`,
        performedBy: req.user._id,
        balanceAfter: updatedUser.walletBalance,
      });
    }

    // 1. Upload source PDF to S3 staging
    const jobId = new mongoose.Types.ObjectId();
    const sourceKey = generateS3Key('card-processing/jobs', `${jobId}/source`, req.file.originalname);
    
    await uploadFile({
      buffer: req.file.buffer,
      key: sourceKey,
      contentType: req.file.mimetype,
    });

    // Calculate normalizedCrop if missing (fallback for backward compatibility)
    const normCrop = profile.normalizedCrop && profile.normalizedCrop.width > 0 ? profile.normalizedCrop : {
      x: profile.crop.x / (profile.source.pageWidth || 595.27),
      y: profile.crop.y / (profile.source.pageHeight || 841.89),
      width: profile.crop.width / (profile.source.pageWidth || 595.27),
      height: profile.crop.height / (profile.source.pageHeight || 841.89)
    };

    let normCropBack = undefined;
    if (profile.layoutMode === 'double' && profile.cropBack && profile.cropBack.width > 5) {
      normCropBack = profile.normalizedCropBack && profile.normalizedCropBack.width > 0 ? profile.normalizedCropBack : {
        x: profile.cropBack.x / (profile.source.pageWidth || 595.27),
        y: profile.cropBack.y / (profile.source.pageHeight || 841.89),
        width: profile.cropBack.width / (profile.source.pageWidth || 595.27),
        height: profile.cropBack.height / (profile.source.pageHeight || 841.89)
      };
    }

    // 2. Create pending CardProcessingJob record
    let job = await CardProcessingJob.create({
      _id: jobId,
      agent: req.user._id,
      profile: profile._id,
      amountCharged: cardPrice,
      sourceFile: {
        key: sourceKey,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      status: 'pending',
      configurationVersion: profile.version || 1,
      processingSnapshot: {
        source: {
          pageNumber: profile.source.pageNumber || 1,
          pageWidth: profile.source.pageWidth,
          pageHeight: profile.source.pageHeight,
          pagesCount: profile.source.pagesCount
        },
        crop: {
          x: profile.crop.x,
          y: profile.crop.y,
          width: profile.crop.width,
          height: profile.crop.height
        },
        normalizedCrop: normCrop,
        cropBack: profile.cropBack ? {
          x: profile.cropBack.x,
          y: profile.cropBack.y,
          width: profile.cropBack.width,
          height: profile.cropBack.height,
          pageNumber: profile.cropBack.pageNumber
        } : undefined,
        normalizedCropBack: normCropBack,
        output: {
          width: profile.output.width,
          height: profile.output.height,
          unit: profile.output.unit,
          dpi: profile.output.dpi
        },
        layoutMode: profile.layoutMode,
        cropMappingMode: profile.cropMappingMode || 'normalized'
      }
    });

    // Check if the uploaded PDF is encrypted
    const encrypted = await isEncrypted(req.file.buffer);
    if (encrypted) {
      job.status = 'password_required';
      await job.save();
      return res.status(200).json({
        success: true,
        message: 'PDF is password protected. Password is required.',
        data: {
          job,
          passwordRequired: true
        }
      });
    }

    // 3. Process the PDF synchronously
    try {
      job = await processJob(job._id);
    } catch (processErr) {
      // Error is caught, logged and updated inside processJob
      return res.status(500).json({
        success: false,
        message: processErr.message || 'PDF processing failed. Please try again.',
        jobId: job._id,
      });
    }

    // 4. Generate signed download URL for the processed output PDF
    let signedDownloadUrl = '';
    if (job.outputFile && job.outputFile.key) {
      signedDownloadUrl = await getSignedDownloadUrl(job.outputFile.key, 3600); // 1 hour link expiry
    }

    res.status(200).json({
      success: true,
      message: 'PDF processed successfully',
      data: {
        job,
        downloadUrl: signedDownloadUrl,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Unlock a password-protected PDF and process it
// @route   POST /api/agent/card-processing/jobs/:id/unlock
// @access  Private/Agent
exports.unlockAndProcessPdf = async (req, res, next) => {
  const jobId = req.params.id;
  console.log(`[CardProcessing] Unlock started for job: ${jobId}`);

  try {
    const { password } = req.body;
    if (!password) {
      console.log(`[CardProcessing] Password validation failed: PASSWORD_REQUIRED`);
      return res.status(400).json({
        success: false,
        code: 'PASSWORD_REQUIRED',
        message: 'Password is required to unlock this PDF.'
      });
    }

    const job = await CardProcessingJob.findById(jobId);
    if (!job) {
      console.log(`[CardProcessing] Job not found: ${jobId}`);
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Processing job not found.'
      });
    }

    // Verify that the authenticated agent owns the processing job
    if (job.agent.toString() !== req.user._id.toString()) {
      console.log(`[CardProcessing] Unauthorized job access: Forbidden for user ${req.user._id}`);
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Not authorized to access this job.'
      });
    }

    if (job.status !== 'password_required') {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        message: `Job is currently in '${job.status}' status and cannot be unlocked.`
      });
    }

    console.log(`[CardProcessing] Loading source PDF`);
    // Retrieve original PDF from S3
    let s3Response;
    try {
      const { getObject } = require('../utils/s3Storage');
      s3Response = await getObject(job.sourceFile.key);
    } catch (s3Err) {
      console.log(`[CardProcessing] Unexpected processing error: S3 loading failed`);
      logger.error('Failed to retrieve source PDF from S3:', s3Err);
      return res.status(500).json({
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve uploaded PDF from storage.'
      });
    }

    // Convert stream to Buffer
    const sourceBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      s3Response.Body.on('data', (chunk) => chunks.push(chunk));
      s3Response.Body.on('error', (err) => reject(err));
      s3Response.Body.on('end', () => resolve(Buffer.concat(chunks)));
    });

    console.log(`[CardProcessing] PDF encryption detected`);
    // Attempt to decrypt
    let decryptedBuffer;
    try {
      decryptedBuffer = await decryptPdf(sourceBuffer, password);
    } catch (decryptErr) {
      if (decryptErr.code === 'INVALID_PASSWORD') {
        console.log(`[CardProcessing] Password validation failed: INVALID_PASSWORD`);
        return res.status(400).json({
          success: false,
          code: 'INVALID_PASSWORD',
          message: decryptErr.message
        });
      }
      if (decryptErr.code === 'UNSUPPORTED_ENCRYPTION') {
        console.log(`[CardProcessing] Password validation failed: UNSUPPORTED_ENCRYPTION`);
        return res.status(422).json({
          success: false,
          code: 'UNSUPPORTED_ENCRYPTION',
          message: decryptErr.message
        });
      }
      console.log(`[CardProcessing] Unexpected processing error: Decrypt error`);
      return res.status(500).json({
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: decryptErr.message || 'An unexpected decryption error occurred.'
      });
    }

    // Password is correct! Transition job status to processing
    job.status = 'processing';
    job.startedAt = new Date();
    await job.save();

    // Run the remaining processing steps synchronously in-memory
    let processedJob;
    try {
      console.log('[CardProcessing] Starting existing crop pipeline');
      processedJob = await processUnlockedJob(job, decryptedBuffer);
    } catch (processErr) {
      console.log(`[CardProcessing] Unexpected processing error: Crop engine run failed`);
      // If there's a genuine processing error, mark job as failed
      job.status = 'failed';
      job.error = processErr.message || 'Failed to process card. Please try again.';
      job.completedAt = new Date();
      await job.save();

      return res.status(500).json({
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: job.error,
        jobId: job._id
      });
    }

    // Generate signed download URL
    let signedDownloadUrl = '';
    if (processedJob.outputFile && processedJob.outputFile.key) {
      signedDownloadUrl = await getSignedDownloadUrl(processedJob.outputFile.key, 3600);
    }

    res.status(200).json({
      success: true,
      message: 'PDF unlocked and processed successfully',
      data: {
        job: processedJob,
        downloadUrl: signedDownloadUrl
      }
    });
  } catch (err) {
    console.log(`[CardProcessing] Unexpected processing error: ${err.message}`);
    next(err);
  }
};

// @desc    Get status and results of a processing job
// @route   GET /api/agent/card-processing/jobs/:id
// @access  Private/Agent
exports.getJobStatus = async (req, res, next) => {
  try {
    const job = await CardProcessingJob.findById(req.params.id).populate('profile', 'name code');
    if (!job) {
      return res.status(404).json({ success: false, message: 'Processing job not found' });
    }

    // Check ownership: Agents can only view their own jobs
    if (req.user.role === 'agent' && job.agent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this job' });
    }

    const jobObj = job.toObject();
    if (jobObj.outputFile && jobObj.outputFile.key) {
      jobObj.downloadUrl = await getSignedDownloadUrl(jobObj.outputFile.key, 3600);
    }

    res.status(200).json({
      success: true,
      data: jobObj,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all card processing jobs for current agent
// @route   GET /api/agent/card-processing/jobs
// @access  Private/Agent
exports.getJobs = async (req, res, next) => {
  try {
    const jobs = await CardProcessingJob.find({ agent: req.user._id })
      .populate('profile', 'name code layoutMode crop cropBack output coverImage')
      .sort('-createdAt');

    const signedJobs = await Promise.all(
      jobs.map(async (job) => {
        const obj = job.toObject();
        if (obj.outputFile && obj.outputFile.key) {
          try {
            obj.downloadUrl = await getSignedDownloadUrl(obj.outputFile.key, 3600);
          } catch (err) {
            logger.error(`Failed to sign output key: ${obj.outputFile.key}`, err);
          }
        }
        return obj;
      })
    );

    res.status(200).json({
      success: true,
      count: signedJobs.length,
      data: signedJobs,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get sample PDF file bytes directly (proxied to avoid S3 CORS issues)
// @route   GET /api/admin/card-processing/:id/sample-file
// @access  Private/Admin
exports.getSampleFile = async (req, res, next) => {
  try {
    const profile = await CardProcessingProfile.findById(req.params.id);
    if (!profile || !profile.sampleFile || !profile.sampleFile.key) {
      return res.status(404).json({ success: false, message: 'Sample file not found' });
    }

    const { getObject: getS3Object } = require('../utils/s3Storage');
    const s3Response = await getS3Object(profile.sampleFile.key);

    const chunks = [];
    const stream = s3Response.Body;
    const buffer = await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

// @desc    Get job output PDF file bytes directly (proxied to avoid CORS)
// @route   GET /api/agent/card-processing/jobs/:id/output
// @access  Private/Agent
exports.getJobOutput = async (req, res, next) => {
  try {
    const job = await CardProcessingJob.findOne({ _id: req.params.id, agent: req.user._id });
    if (!job || !job.outputFile || !job.outputFile.key) {
      return res.status(404).json({ success: false, message: 'Job output file not found' });
    }

    const { getObject: getS3Object } = require('../utils/s3Storage');
    const s3Response = await getS3Object(job.outputFile.key);

    const chunks = [];
    const stream = s3Response.Body;
    const buffer = await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};
