const express = require('express');
const {
  getActiveProfiles,
  processPdf,
  getJobStatus,
  getJobs,
  getJobOutput,
  unlockAndProcessPdf,
} = require('../controllers/cardProcessingController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// All routes require protection and agent authorization
router.use(protect);
router.use(authorize('agent'));

router.get('/profiles', getActiveProfiles);
router.post('/process', upload.cardUpload.single('pdfFile'), upload.cardUpload.validateBufferIntegrity, processPdf);
router.get('/jobs', getJobs);
router.get('/jobs/:id', getJobStatus);
router.post('/jobs/:id/unlock', unlockAndProcessPdf);
router.get('/jobs/:id/output', getJobOutput);

module.exports = router;
