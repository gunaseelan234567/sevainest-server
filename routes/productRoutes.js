const express = require('express');
const {
  getProducts,
  getAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', getProducts);
router.get('/admin', authorize('admin'), getAdminProducts);
router.post('/', authorize('admin'), upload.single('productImage'), createProduct);

router
  .route('/:id')
  .put(authorize('admin'), upload.single('productImage'), updateProduct)
  .delete(authorize('admin'), deleteProduct);

module.exports = router;
