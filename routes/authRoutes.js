const express = require('express');
const {
  register,
  login,
  getMe,
  getUsers,
  logout,
  registerAgent,
  verifyRegistrationPayment,
  activateAgent,
  rejectAgent,
  forgotPassword,
  resetPassword,
  bulkEmail,
  sendVerificationCode,
  verifyEmail,
  setup2FA,
  verify2FA,
  disable2FA,
  login2FA,
  deleteUser,
  restoreUser,
  verifyCriticalAction,
  updateUserPermissions,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { deleteRateLimiter, verifyAdminDelete } = require('../middleware/deleteGuard');

const router = express.Router();

router.post('/register', protect, authorize('admin'), register); // Changed to admin protected
router.post('/register-agent', registerAgent);
router.post('/verify-registration-payment', verifyRegistrationPayment);
router.post('/verify-registration', verifyRegistrationPayment);
router.post('/login', login);
router.get('/logout', logout);
router.get('/me', protect, getMe);
router.post('/send-verification', protect, sendVerificationCode);
router.post('/verify-email', protect, verifyEmail);
router.get('/users', protect, authorize('admin'), getUsers);
const criticalActionGuard = require('../middleware/criticalActionGuard');

router.patch('/activate/:id', protect, authorize('admin'), activateAgent);
router.patch('/reject/:id', protect, authorize('admin'), rejectAgent);
router.delete('/user/:id', protect, authorize('admin'), deleteRateLimiter, verifyAdminDelete({ targetType: 'user', requireDoubleConfirm: true }), deleteUser);
router.patch('/user/:id/restore', protect, authorize('admin'), restoreUser);
router.post('/forgotpassword', forgotPassword);
router.post('/resetpassword', resetPassword);
router.post('/bulk-email', protect, authorize('admin'), bulkEmail);

router.post('/setup-2fa', protect, setup2FA);
router.post('/verify-2fa', protect, verify2FA);
router.post('/disable-2fa', protect, disable2FA);
router.post('/login-2fa', login2FA);
router.post('/verify-critical-action', protect, authorize('admin'), verifyCriticalAction);
router.put('/users/:id/permissions', protect, authorize('admin'), updateUserPermissions);

module.exports = router;
