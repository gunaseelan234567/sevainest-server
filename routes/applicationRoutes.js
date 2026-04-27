const express = require('express');
const {
  submitApplication,
  getMyApplications,
  getApplications,
  updateApplicationStatus,
  getAgentStats,
  getAdminDashboardStats,
} = require('../controllers/applicationController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.post('/', authorize('agent'), upload.array('appFiles'), submitApplication);
router.get('/my', authorize('agent'), getMyApplications);
router.get('/stats', authorize('agent'), getAgentStats);
router.get('/admin-stats', authorize('admin'), getAdminDashboardStats);
router.get('/', authorize('admin'), getApplications);
router.patch('/:id', authorize('admin'), updateApplicationStatus);

module.exports = router;
