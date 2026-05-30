const jwt = require('jsonwebtoken');

/**
 * Middleware to verify a temporary 2-minute critical action token
 * before allowing destructive/sensitive operations to proceed.
 */
module.exports = async (req, res, next) => {
  try {
    const token = req.headers['x-critical-action-token'] || req.body.criticalActionToken;

    if (!token) {
      return res.status(403).json({
        success: false,
        criticalActionRequired: true,
        message: 'Critical action verification required.'
      });
    }

    // Verify token validity & expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.isCriticalActionVerified) {
      return res.status(403).json({
        success: false,
        criticalActionRequired: true,
        message: 'Invalid critical action token.'
      });
    }

    // Attach verified context in case we need it
    req.criticalActionVerified = true;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      criticalActionRequired: true,
      message: 'Critical action token expired or invalid. Please re-enter your password.'
    });
  }
};
