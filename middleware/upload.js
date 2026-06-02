const multer = require('multer');
const path = require('path');

// Keep in RAM buffer
const storage = multer.memoryStorage();

// Verify binary magic numbers (signatures) for absolute security
function verifyMagicBytes(buffer, mimetype) {
  if (!buffer || buffer.length < 4) return false;

  const hex = buffer.toString('hex', 0, 4).toLowerCase();

  // JPEG: starts with ffd8
  if (mimetype.includes('jpeg') || mimetype.includes('jpg')) {
    return hex.startsWith('ffd8');
  }

  // PNG: starts with 89504e47
  if (mimetype.includes('png')) {
    return hex === '89504e47';
  }

  // PDF: starts with 25504446 (%PDF)
  if (mimetype.includes('pdf')) {
    return hex === '25504446';
  }

  return false;
}

// Check File Type & Content Integrity
function checkFileType(file, cb) {
  const allowedExts = /jpeg|jpg|png|pdf/;
  const ext = path.extname(file.originalname).toLowerCase();
  
  const isExtValid = allowedExts.test(ext);
  const isMimeValid = allowedExts.test(file.mimetype);

  if (!isExtValid || !isMimeValid) {
    return cb(new Error('Only JPG, JPEG, PNG, and PDF files are allowed.'));
  }

  cb(null, true);
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // Strict 1MB limit
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
});

// Middleware helper to inspect uploaded buffers for magic bytes
const validateBufferIntegrity = (req, res, next) => {
  const files = req.files 
    ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) 
    : (req.file ? [req.file] : []);
  
  for (const file of files) {
    if (file.buffer) {
      const isValid = verifyMagicBytes(file.buffer, file.mimetype);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: `File security scan failed: the content of ${file.originalname} does not match its extension.`
        });
      }
    }
  }
  next();
};

// Seamless backward compatibility
upload.upload = upload;
upload.validateBufferIntegrity = validateBufferIntegrity;

module.exports = upload;
