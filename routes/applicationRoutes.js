const express = require('express');
const {
  submitApplication,
  getMyApplications,
  getApplications,
  updateApplicationStatus,
  resubmitApplication,
  getAgentStats,
  getAdminDashboardStats,
} = require('../controllers/applicationController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router.post('/', authorize('agent'), upload.array('appFiles'), upload.validateBufferIntegrity, submitApplication);
router.get('/my', authorize('agent'), getMyApplications);
router.get('/stats', authorize('agent'), getAgentStats);
router.get('/admin-stats', authorize('admin'), getAdminDashboardStats);
router.get('/', authorize('admin'), getApplications);
router.patch('/:id', authorize('admin'), upload.single('approvedDoc'), upload.validateBufferIntegrity, validate(schemas.updateApplicationStatus), updateApplicationStatus);
router.patch('/:id/resubmit', authorize('agent'), upload.array('appFiles'), upload.validateBufferIntegrity, resubmitApplication);

module.exports = router;
