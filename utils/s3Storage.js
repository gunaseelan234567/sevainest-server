const s3 = require('../config/s3');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

/**
 * Uploads a file buffer to AWS S3.
 * 
 * @param {Object} params
 * @param {Buffer} params.buffer - The file buffer to upload
 * @param {String} params.key - The S3 object key
 * @param {String} params.contentType - The MIME type of the file
 * @param {Object} [params.metadata] - Optional metadata key-value pairs
 * @returns {Promise<Object>} - The key and bucket metadata
 */
const uploadFile = async ({ buffer, key, contentType, metadata }) => {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET is not configured in environment variables');
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    Metadata: metadata,
  });

  await s3.send(command);

  return {
    key,
    bucket: BUCKET_NAME,
  };
};

/**
 * Deletes a file from AWS S3.
 * 
 * @param {String} key - The S3 object key
 * @returns {Promise<void>}
 */
const deleteFile = async (key) => {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET is not configured in environment variables');
  }
  if (!key) return;

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3.send(command);
};

/**
 * Generates a temporary signed URL for downloading/viewing a file.
 * 
 * @param {String} key - The S3 object key
 * @param {Number} [expiresIn=900] - Expiry time in seconds (default: 15 mins)
 * @returns {Promise<String>} - The signed URL
 */
const getSignedDownloadUrl = async (key, expiresIn = 900) => {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET is not configured in environment variables');
  }
  if (!key) return '';

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3, command, { expiresIn });
};

/**
 * Gets an object from AWS S3 (e.g. for streaming/reading).
 * 
 * @param {String} key - The S3 object key
 * @returns {Promise<Object>} - The S3 command response
 */
const getObject = async (key) => {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET is not configured in environment variables');
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await s3.send(command);
};

/**
 * Checks if an object exists in AWS S3.
 * 
 * @param {String} key - The S3 object key
 * @returns {Promise<Boolean>}
 */
const objectExists = async (key) => {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET is not configured in environment variables');
  }
  if (!key) return false;

  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Sanitizes a filename to prevent path traversal and remove illegal characters.
 * 
 * @param {String} fileName - The original filename
 * @returns {String} - Sanitized base filename
 */
const sanitizeFileName = (fileName) => {
  if (!fileName) return '';
  // Extract base filename to prevent directory traversal
  const baseName = path.basename(fileName);
  // Replace anything that is not alphanumeric, a dot, dash, or underscore with an underscore
  return baseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
};

/**
 * Generates a clean, unique S3 key.
 * 
 * @param {String} folder - Parent prefix folder (e.g., 'applications', 'products')
 * @param {String} identifier - Document/Record identifier (e.g., Application ID, Product ID)
 * @param {String} originalName - Original uploaded filename
 * @returns {String} - Unique S3 key
 */
const generateS3Key = (folder, identifier, originalName) => {
  const sanitized = sanitizeFileName(originalName);
  const ext = path.extname(sanitized);
  const base = path.basename(sanitized, ext);
  return `${folder}/${identifier}/${base}-${uuidv4()}${ext}`;
};

module.exports = {
  uploadFile,
  deleteFile,
  getSignedDownloadUrl,
  getObject,
  objectExists,
  sanitizeFileName,
  generateS3Key,
};
