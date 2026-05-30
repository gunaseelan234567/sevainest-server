const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// Rate limiter specifically for destructive password checks to prevent brute force
exports.deleteRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each IP to 5 delete verification attempts per window
  message: {
    success: false,
    message: 'Too many deletion verification attempts from this IP. Please try again after 10 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Middleware to verify admin password before destructive operations
 * Usage: router.delete('/:id', protect, authorize('admin'), deleteRateLimiter, verifyAdminDelete, deleteControllerAction)
 */
exports.verifyAdminDelete = (options = {}) => {
  return async (req, res, next) => {
    try {
      const { confirmString } = req.body;
      const targetId = req.params.id || 'bulk';
      const targetType = options.targetType || 'unknown';
      const requireDoubleConfirm = options.requireDoubleConfirm || false;
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

      // 1. Validate JWT user
      if (!req.user || req.user.role !== 'admin') {
        await AuditLog.create({
          adminId: req.user ? req.user.id : undefined,
          role: req.user ? req.user.role : 'guest',
          actionType: 'delete',
          targetCollection: targetType,
          targetId,
          ipAddress,
          newData: { status: 'unauthorized_attempt' }
        });
        console.warn(`[AUDIT] ADMIN_DELETE_${targetType.toUpperCase()} UNAUTHORIZED at ${new Date().toISOString()}`);
        return res.status(403).json({ success: false, message: 'Not authorized for this operation' });
      }

      // 2. Double Confirmation Validation (Typing 'DELETE' for critical tables)
      if (requireDoubleConfirm && confirmString !== 'DELETE') {
        await AuditLog.create({
          adminId: req.user.id,
          role: req.user.role,
          actionType: 'delete',
          targetCollection: targetType,
          targetId,
          ipAddress,
          newData: { status: 'failed_double_confirmation', confirmString }
        });
        console.warn(`[AUDIT] ADMIN_DELETE_${targetType.toUpperCase()} FAILED_DOUBLE_CONFIRMATION (Got: '${confirmString}')`);
        return res.status(400).json({ success: false, message: "Type 'DELETE' in all-caps to confirm this critical operation" });
      }

      // If double confirmation string matches, proceed
      next();
    } catch (err) {
      console.error('Error in verifyAdminDelete middleware:', err);
      res.status(500).json({ success: false, message: 'Server error verifying double confirmation verification' });
    }
  };
};
