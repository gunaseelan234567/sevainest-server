const express = require('express');
const { 
  getWalletHistory, 
  submitOfflineRequest,
  getFundRequests,
  updateFundRequestStatus,
  createOnlineOrder,
  verifyCashfreePayment,
  adminAddFunds,
  adminDeductFunds
} = require('../controllers/walletController');
const { protect, authorize } = require('../middleware/auth');

const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/history', getWalletHistory);
router.post('/admin/add-funds', authorize('admin'), adminAddFunds);
router.post('/admin/deduct-funds', authorize('admin'), adminDeductFunds);

// Fund Request Routes
router.post('/online-order', authorize('agent'), createOnlineOrder);
router.post('/cashfree/verify', authorize('agent'), verifyCashfreePayment);
router.post('/request/offline', authorize('agent'), upload.single('proofImage'), submitOfflineRequest);
router.get('/requests', getFundRequests);
router.patch('/requests/:id', authorize('admin'), updateFundRequestStatus);

module.exports = router;
