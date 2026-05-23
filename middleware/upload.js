const multer = require('multer');
const path = require('path');

// Use Memory Storage so the file is kept in a Buffer (RAM).
// This buffer will be passed directly to Supabase in the controller.
const storage = multer.memoryStorage();

// Check File Type
function checkFileType(file, cb) {
  // Allowed extensions (Added doc and docx for general document support)
  const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  // Check extension (Note: with memoryStorage, originalname is sometimes less reliable, but we still check it)
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Error: Invalid file type! Only Images, PDFs, and Documents are allowed.'));
  }
}

// Init Upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Increased to 10MB limit for cloud uploads
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
});

module.exports = upload;

