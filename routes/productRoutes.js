const express = require('express');
const {
  getProducts,
  getAdminProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', getProducts);
router.get('/admin', authorize('admin'), getAdminProducts);
router.get('/:id', getProduct);

router.post('/', authorize('admin'), upload.single('productImage'), createProduct);
router.put('/:id', authorize('admin'), upload.single('productImage'), updateProduct);
router.delete('/:id', authorize('admin'), deleteProduct);

module.exports = router;
