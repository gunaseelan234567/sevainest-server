const express = require('express');
const { 
  getWalletHistory, 
  submitOfflineRequest,
  getFundRequests,
  updateFundRequestStatus,
  createOnlineOrder,
  verifyCashfreePayment,
  adminAddFunds,
  adminDeductFunds,
  getAdminTransactions
} = require('../controllers/walletController');
const { protect, authorize } = require('../middleware/auth');

const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

const criticalActionGuard = require('../middleware/criticalActionGuard');

router.get('/history', getWalletHistory);
router.post('/admin/add-funds', authorize('admin'), criticalActionGuard, adminAddFunds);
router.post('/admin/deduct-funds', authorize('admin'), criticalActionGuard, adminDeductFunds);
router.get('/admin/transactions', authorize('admin'), getAdminTransactions);

// Fund Request Routes
router.post('/online-order', authorize('agent'), createOnlineOrder);
router.post('/cashfree/verify', authorize('agent'), verifyCashfreePayment);
router.post('/request/offline', authorize('agent'), upload.single('proofImage'), upload.validateBufferIntegrity, submitOfflineRequest);
router.get('/requests', getFundRequests);
router.patch('/requests/:id', authorize('admin'), criticalActionGuard, updateFundRequestStatus);

module.exports = router;
