const CardProcessingProfile = require('../../models/CardProcessingProfile');
const CardProcessingJob = require('../../models/CardProcessingJob');
const { getObject, uploadFile, generateS3Key } = require('../../utils/s3Storage');
const { generateCardPdf } = require('./outputGenerator');
const logger = require('../../utils/logger');

/**
 * Converts a stream (from S3 getObject) to a Buffer.
 */
const streamToBuffer = async (stream) => {
  if (!stream) {
    throw new Error('S3 stream is empty or undefined');
  }
  if (typeof stream.transformToByteArray === 'function') {
    const arr = await stream.transformToByteArray();
    return Buffer.from(arr);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

/**
 * Orchestrates the card cropping and scaling processing job.
 * 
 * @param {String} jobId - CardProcessingJob ID
 * @returns {Promise<Object>} - Job document
 */
exports.processJob = async (jobId) => {
  let job = await CardProcessingJob.findById(jobId);
  if (!job) {
    throw new Error('Card processing job not found.');
  }

  const profile = await CardProcessingProfile.findById(job.profile);
  if (!profile) {
    job.status = 'failed';
    job.error = 'Card processing profile not found.';
    job.completedAt = new Date();
    await job.save();
    throw new Error('Card processing profile not found.');
  }

  try {
    // 1. Update job to processing state
    job.status = 'processing';
    job.startedAt = new Date();
    await job.save();

    logger.log(`[CardProcessor] Starting processing for Job ID: ${jobId}, Profile: ${profile.name}`);

    // 2. Retrieve original PDF from S3
    const s3Response = await getObject(job.sourceFile.key);
    const sourceBuffer = await streamToBuffer(s3Response.Body);

    // Check if the source file is encrypted (safety guard)
    const { isEncrypted } = require('./pdfRenderer');
    const encrypted = await isEncrypted(sourceBuffer);
    if (encrypted) {
      job.status = 'password_required';
      await job.save();
      throw new Error('PDF is password protected.');
    }

    // 3. Process the PDF (crop and scale)
    const snapshot = job.processingSnapshot && job.processingSnapshot.crop ? job.processingSnapshot : profile;
    const outputBuffer = await generateCardPdf(sourceBuffer, snapshot);

    // 4. Generate a clean unique key for the output file
    const outputKey = generateS3Key('card-processing/jobs', `${jobId}/output`, `processed-${job.sourceFile.originalName}`);

    // 5. Upload the output file to S3
    await uploadFile({
      buffer: outputBuffer,
      key: outputKey,
      contentType: 'application/pdf',
    });

    // 6. Update job status to completed
    job.status = 'completed';
    job.outputFile = {
      key: outputKey,
      originalName: `processed-${job.sourceFile.originalName}`,
      mimeType: 'application/pdf',
      size: outputBuffer.length,
    };
    job.completedAt = new Date();
    await job.save();

    logger.log(`[CardProcessor] Completed processing for Job ID: ${jobId}`);
    return job;
  } catch (err) {
    logger.error(`[CardProcessor] Failed processing for Job ID: ${jobId}`, err);

    // Keep job in password_required if it was set so, otherwise mark as failed
    if (job.status !== 'password_required') {
      job.status = 'failed';
    }
    // Use agent-friendly error message, log technical error details
    job.error = err.message || 'Unable to process this PDF. Please upload the original PDF again.';
    job.completedAt = new Date();

    // Refund wallet if job failed and card price was charged
    if (job.status === 'failed' && job.amountCharged > 0) {
      try {
        const User = require('../../models/User');
        const WalletTransaction = require('../../models/WalletTransaction');
        const updatedUser = await User.findByIdAndUpdate(job.agent, { $inc: { walletBalance: job.amountCharged } }, { new: true });
        if (updatedUser) {
          await WalletTransaction.create({
            agentId: job.agent,
            type: 'credit',
            amount: job.amountCharged,
            reason: `Refund: ID Maker Job Failed`,
            performedBy: job.agent,
            balanceAfter: updatedUser.walletBalance,
          });
          job.amountCharged = 0; // Reset so refund happens only once
        }
      } catch (refundErr) {
        logger.error(`[CardProcessor] Refund failed for Job ID: ${jobId}`, refundErr);
      }
    }

    await job.save();
    
    throw err;
  }
};

/**
 * Processes a pre-decrypted source PDF buffer for a job in-memory.
 * 
 * @param {Object} job - CardProcessingJob document
 * @param {Buffer} decryptedBuffer - Decrypted PDF buffer
 * @returns {Promise<Object>} - Updated Job document
 */
exports.processUnlockedJob = async (job, decryptedBuffer) => {
  const profile = await CardProcessingProfile.findById(job.profile);
  if (!profile) {
    throw new Error('Card processing profile not found.');
  }

  // 1. Process the PDF (crop and scale)
  const snapshot = job.processingSnapshot && job.processingSnapshot.crop ? job.processingSnapshot : profile;
  const outputBuffer = await generateCardPdf(decryptedBuffer, snapshot);

  // 2. Generate a clean unique key for the output file
  const outputKey = generateS3Key('card-processing/jobs', `${job._id}/output`, `processed-${job.sourceFile.originalName}`);

  // 3. Upload the output file to S3
  await uploadFile({
    buffer: outputBuffer,
    key: outputKey,
    contentType: 'application/pdf',
  });

  // 4. Update status to completed
  job.status = 'completed';
  job.outputFile = {
    key: outputKey,
    originalName: `processed-${job.sourceFile.originalName}`,
    mimeType: 'application/pdf',
    size: outputBuffer.length,
  };
  job.completedAt = new Date();
  await job.save();

  return job;
};
