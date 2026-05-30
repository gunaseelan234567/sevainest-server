const AuditLog = require('../models/AuditLog');

/**
 * Utility to log admin actions asynchronously
 * @param {Object} params
 * @param {string} params.adminId
 * @param {string} params.role
 * @param {string} params.actionType
 * @param {string} params.targetCollection
 * @param {string} params.targetId
 * @param {Object} params.oldData
 * @param {Object} params.newData
 * @param {Object} req - Express request object for IP & User Agent extraction
 */
const logAdminAction = async ({
  adminId,
  role,
  actionType,
  targetCollection,
  targetId,
  oldData,
  newData,
  req
}) => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') : '';
    const userAgent = req ? (req.headers['user-agent'] || '') : '';

    await AuditLog.create({
      adminId: adminId || (req && req.user ? req.user._id : null),
      role: role || (req && req.user ? req.user.role : 'guest'),
      actionType,
      targetCollection,
      targetId,
      oldData,
      newData,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('Failed to save audit log:', error);
  }
};

module.exports = { logAdminAction };
