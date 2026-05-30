const express = require('express');
const {
  getProducts,
  getAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const { deleteRateLimiter, verifyAdminDelete } = require('../middleware/deleteGuard');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', getProducts);
router.get('/admin', authorize('admin'), getAdminProducts);
router.post('/', authorize('admin'), upload.single('productImage'), createProduct);

router
  .route('/:id')
  .put(authorize('admin'), upload.single('productImage'), updateProduct)
  .delete(authorize('admin'), deleteRateLimiter, verifyAdminDelete({ targetType: 'product', requireDoubleConfirm: false }), deleteProduct);

router.patch('/:id/restore', authorize('admin'), restoreProduct);

module.exports = router;
