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
  updateUser,
} = require('../controllers/authController');

const { protect, authorize } = require('../middleware/auth');
const { deleteRateLimiter, verifyAdminDelete } = require('../middleware/deleteGuard');
const { validate, schemas } = require('../middleware/validate');
const criticalActionGuard = require('../middleware/criticalActionGuard');

const router = express.Router();

router.post('/register', protect, authorize('admin'), validate(schemas.register), register);
router.post('/register-agent', validate(schemas.registerAgent), registerAgent);
router.post('/verify-registration-payment', verifyRegistrationPayment);
router.post('/verify-registration', verifyRegistrationPayment);
router.post('/login', validate(schemas.login), login);
router.get('/logout', logout);
router.get('/me', protect, getMe);
router.post('/send-verification', protect, sendVerificationCode);
router.post('/verify-email', protect, validate(schemas.verifyEmail), verifyEmail);
router.get('/users', protect, authorize('admin'), getUsers);

router.put('/user/:id', protect, authorize('admin'), updateUser);
router.patch('/activate/:id', protect, authorize('admin'), activateAgent);
router.patch('/reject/:id', protect, authorize('admin'), rejectAgent);
router.delete('/user/:id', protect, authorize('admin'), deleteRateLimiter, verifyAdminDelete({ targetType: 'user', requireDoubleConfirm: true }), deleteUser);
router.patch('/user/:id/restore', protect, authorize('admin'), restoreUser);
router.post('/forgotpassword', validate(schemas.forgotPassword), forgotPassword);
router.post('/resetpassword', validate(schemas.resetPassword), resetPassword);
router.post('/bulk-email', protect, authorize('admin'), validate(schemas.bulkEmail), bulkEmail);

router.post('/setup-2fa', protect, setup2FA);
router.post('/verify-2fa', protect, verify2FA);
router.post('/disable-2fa', protect, disable2FA);
router.post('/login-2fa', login2FA);
router.post('/verify-critical-action', protect, authorize('admin'), verifyCriticalAction);
router.put('/users/:id/permissions', protect, authorize('admin'), updateUserPermissions);

module.exports = router;
