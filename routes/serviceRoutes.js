const express = require('express');
const {
  getServices,
  getAllServices,
  createService,
  updateService,
  deleteService,
  restoreService,
} = require('../controllers/serviceController');
const { protect, authorize } = require('../middleware/auth');
const { deleteRateLimiter, verifyAdminDelete } = require('../middleware/deleteGuard');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', getServices);
router.get('/all', authorize('admin'), getAllServices);
router.post('/', authorize('admin'), upload.single('image'), createService);
const criticalActionGuard = require('../middleware/criticalActionGuard');

router
  .route('/:id')
  .put(authorize('admin'), upload.single('image'), updateService)
  .delete(authorize('admin'), deleteRateLimiter, criticalActionGuard, verifyAdminDelete({ targetType: 'service', requireDoubleConfirm: true }), deleteService);

router.patch('/:id/restore', authorize('admin'), restoreService);

module.exports = router;
