const express = require('express');
const {
  getOrders,
  getMyOrders,
  createOrder,
  createOfflineOrder,
  initiateOnlineOrder,
  verifyOnlineOrder,
  updateOrder
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin'), getOrders);
router.get('/my', getMyOrders);
router.post('/', authorize('agent'), createOrder);
router.post('/offline', authorize('agent'), createOfflineOrder);
router.post('/initiate-online', authorize('agent'), initiateOnlineOrder);
router.post('/verify-online', authorize('agent'), verifyOnlineOrder);

router.patch('/:id', authorize('admin'), updateOrder);

module.exports = router;
