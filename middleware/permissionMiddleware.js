/**
 * Middleware to assert dynamic permissions
 * @param {string} requiredPermission - E.g. 'users.delete', 'services.create'
 */
module.exports = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Direct bypass for emergency or super admin roles if needed, or check explicit permissions
    const hasPermission = req.user.permissions && (
      req.user.permissions.includes(requiredPermission) || 
      req.user.permissions.includes('*') ||
      req.user.email === 'sevainestofficial@gmail.com' // Master super-admin check
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Security Access Blocked: You do not have the required permission '${requiredPermission}' to complete this action.`
      });
    }

    next();
  };
};
