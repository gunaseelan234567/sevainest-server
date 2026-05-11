const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Set Storage Engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let dest = 'uploads/others';
    
    // Choose destination based on fieldname
    if (file.fieldname === 'image') {
      dest = 'uploads/services';
    } else if (file.fieldname === 'productImage') {
      dest = 'uploads/products';
    } else if (file.fieldname === 'proofImage') {
      dest = 'uploads/proofs';
    } else if (file.fieldname === 'appFile' || file.fieldname === 'appFiles') {
      dest = 'uploads/applications';
    } else if (file.fieldname === 'manualPaymentQR') {
      dest = 'uploads/settings';
    }

    // Make sure path exists
    const fullPath = path.join(__dirname, '..', dest);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    cb(null, fullPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// Check File Type
function checkFileType(file, cb) {
  // Allowed extensions
  const filetypes = /jpeg|jpg|png|gif|pdf/;
  // Check extension
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Error: Images/PDFs Only!'));
  }
}

// Init Upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
});

module.exports = upload;
