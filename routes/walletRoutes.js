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
const { validate, schemas } = require('../middleware/validate');
const criticalActionGuard = require('../middleware/criticalActionGuard');

const router = express.Router();

router.use(protect);

router.get('/history', getWalletHistory);
router.post('/admin/add-funds', authorize('admin'), criticalActionGuard, validate(schemas.adminFunds), adminAddFunds);
router.post('/admin/deduct-funds', authorize('admin'), criticalActionGuard, validate(schemas.adminFunds), adminDeductFunds);
router.get('/admin/transactions', authorize('admin'), getAdminTransactions);

// Fund Request Routes
router.post('/online-order', authorize('agent'), validate(schemas.onlineOrder), createOnlineOrder);
router.post('/cashfree/verify', authorize('agent'), validate(schemas.verifyCashfree), verifyCashfreePayment);
router.post('/request/offline', authorize('agent'), upload.single('proofImage'), upload.validateBufferIntegrity, submitOfflineRequest);
router.get('/requests', getFundRequests);
router.patch('/requests/:id', authorize('admin'), criticalActionGuard, validate(schemas.fundRequestStatus), updateFundRequestStatus);

module.exports = router;
