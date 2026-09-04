const express = require('express');
const {
  getProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  uploadSample,
  uploadCoverImage,
  previewConfig,
  publishProfile,
  getSampleFile,
} = require('../controllers/cardProcessingController');
const { protect, authorize } = require('../middleware/auth');
const { deleteRateLimiter, verifyAdminDelete } = require('../middleware/deleteGuard');
const upload = require('../middleware/upload');

const router = express.Router();

// All routes require protection and admin authorization
router.use(protect);
router.use(authorize('admin'));

router
  .route('/')
  .get(getProfiles)
  .post(createProfile);

router
  .route('/:id')
  .get(getProfile)
  .put(updateProfile)
  .delete(
    deleteRateLimiter,
    verifyAdminDelete({ targetType: 'card-processing-profile', requireDoubleConfirm: true }),
    deleteProfile
  );

router.get('/:id/sample-file', getSampleFile);
router.post('/:id/sample', upload.cardUpload.single('sampleFile'), upload.cardUpload.validateBufferIntegrity, uploadSample);
router.post('/:id/cover', upload.cardUpload.single('coverImage'), upload.cardUpload.validateBufferIntegrity, uploadCoverImage);
router.post('/:id/preview', previewConfig);
router.post('/:id/publish', publishProfile);

module.exports = router;
