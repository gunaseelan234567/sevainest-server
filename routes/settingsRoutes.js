const express = require('express');
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.get('/', getSettings);
router.patch('/', protect, authorize('admin'), upload.fields([
  { name: 'manualPaymentQR', maxCount: 1 },
  { name: 'welcomeImage', maxCount: 1 }
]), updateSettings);

module.exports = router;
