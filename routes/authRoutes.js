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
  forgotPassword,
  resetPassword,
  bulkEmail,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/register', protect, authorize('admin'), register); // Changed to admin protected
router.post('/register-agent', registerAgent);
router.post('/verify-registration-payment', verifyRegistrationPayment);
router.post('/login', login);
router.get('/logout', logout);
router.get('/me', protect, getMe);
router.get('/users', protect, authorize('admin'), getUsers);
router.patch('/activate/:id', protect, authorize('admin'), activateAgent);
router.post('/forgotpassword', forgotPassword);
router.post('/resetpassword', resetPassword);
router.post('/bulk-email', protect, authorize('admin'), bulkEmail);

module.exports = router;
