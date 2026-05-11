const express = require('express');
const {
  createOrder,
  getMyOrders,
  getOrders,
  updateOrderStatus,
  initiateOnlineOrder,
  verifyOnlineOrder,
  createOfflineOrder,
  confirmOrderReceipt
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/', authorize('agent'), createOrder);
router.post('/initiate-online', authorize('agent'), initiateOnlineOrder);
router.post('/verify-online', authorize('agent'), verifyOnlineOrder);
router.post('/offline', authorize('agent'), createOfflineOrder);
router.patch('/:id/confirm', authorize('agent'), confirmOrderReceipt);
router.get('/my', authorize('agent'), getMyOrders);
router.get('/', authorize('admin'), getOrders);
router.patch('/:id', authorize('admin'), updateOrderStatus);

module.exports = router;
