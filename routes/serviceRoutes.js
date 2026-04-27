const express = require('express');
const {
  getServices,
  getAllServices,
  createService,
  updateService,
  deleteService,
} = require('../controllers/serviceController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', getServices);
router.get('/all', authorize('admin'), getAllServices);
router.post('/', authorize('admin'), upload.single('image'), createService);
router
  .route('/:id')
  .put(authorize('admin'), upload.single('image'), updateService)
  .delete(authorize('admin'), deleteService);

module.exports = router;
