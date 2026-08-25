const express = require('express');
const {
  createInstantService,
  getAllInstantServices,
  updateInstantService,
  deleteInstantService,
  restoreInstantService,
  getActiveInstantServices,
  executeInstantService,
  getAgentHistory,
  getAgentHistoryDetail,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/instantServiceController');
const { protect, authorize } = require('../middleware/auth');
const { deleteRateLimiter, verifyAdminDelete } = require('../middleware/deleteGuard');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

// Categories Routes
router.get('/categories/all', getCategories);
router.post('/categories', authorize('admin'), createCategory);
router.put('/categories/:id', authorize('admin'), updateCategory);
router.delete('/categories/:id', authorize('admin'), deleteCategory);

// Agent Routes
router.get('/', authorize('agent'), getActiveInstantServices);
router.post('/:id/execute', authorize('agent'), executeInstantService);
router.get('/history', authorize('agent'), getAgentHistory);
router.get('/history/:id', authorize('agent'), getAgentHistoryDetail);

// Admin Routes
router.get('/all', authorize('admin'), getAllInstantServices);
router.post('/', authorize('admin'), upload.single('image'), upload.validateBufferIntegrity, createInstantService);

router
  .route('/:id')
  .put(authorize('admin'), upload.single('image'), upload.validateBufferIntegrity, updateInstantService)
  .delete(authorize('admin'), deleteRateLimiter, verifyAdminDelete({ targetType: 'instant-service', requireDoubleConfirm: true }), deleteInstantService);

router.patch('/:id/restore', authorize('admin'), restoreService = restoreInstantService);

module.exports = router;
