const express = require('express');
const { getSettings, updateSettings, uploadCategoryImage } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.get('/', getSettings);
router.patch('/', protect, authorize('admin'), upload.fields([
  { name: 'manualPaymentQR', maxCount: 1 },
  { name: 'welcomeImage', maxCount: 1 }
]), updateSettings);

router.post('/category-image', protect, authorize('admin'), upload.single('image'), uploadCategoryImage);

module.exports = router;
