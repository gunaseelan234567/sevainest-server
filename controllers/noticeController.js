const Notice = require('../models/Notice');
const AuditLog = require('../models/AuditLog');

// @desc    Get active notices
// @route   GET /api/notice/active
// @access  Private
exports.getActiveNotices = async (req, res, next) => {
  try {
    const notices = await Notice.find({ isActive: true }).sort('-createdAt');
    res.status(200).json({ success: true, data: notices });
  } catch (err) {
    next(err);
  }
};

// @desc    Create notice (Admin)
// @route   POST /api/notice
// @access  Private/Admin
exports.createNotice = async (req, res, next) => {
  try {
    req.body.createdBy = req.user.id;
    const notice = await Notice.create(req.body);
    res.status(201).json({ success: true, data: notice });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete notice (Soft delete with password & logging)
// @route   DELETE /api/notice/:id
// @access  Private/Admin
exports.deleteNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }

    notice.isDeleted = true;
    notice.deletedAt = new Date();
    await notice.save();

    // Create success audit log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'delete',
      targetCollection: 'notices',
      targetId: notice._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'deleted' }
    });

    console.log(`[AUDIT] ADMIN_DELETE_NOTICE SUCCESS: ID: ${notice._id} by Admin: ${req.user.id}`);

    res.status(200).json({ success: true, message: 'Notice soft-deleted successfully', data: {} });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore notice (Admins only)
// @route   PATCH /api/notice/:id/restore
// @access  Private/Admin
exports.restoreNotice = async (req, res, next) => {
  try {
    // Specifically search with isDeleted: true to locate soft-deleted record
    const notice = await Notice.findOne({ _id: req.params.id, isDeleted: true });

    if (!notice) {
      return res.status(404).json({ success: false, message: 'Soft-deleted notice not found' });
    }

    notice.isDeleted = false;
    notice.deletedAt = null;
    await notice.save();

    // Create success audit log
    await AuditLog.create({
      adminId: req.user.id,
      role: req.user.role || 'admin',
      actionType: 'update',
      targetCollection: 'notices',
      targetId: notice._id.toString(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      newData: { status: 'restored' }
    });

    console.log(`[AUDIT] ADMIN_RESTORE_NOTICE SUCCESS: ID: ${notice._id} by Admin: ${req.user.id}`);

    res.status(200).json({ success: true, message: 'Notice restored successfully', data: notice });
  } catch (err) {
    next(err);
  }
};

// @desc    Update notice (Admin)
// @route   PUT /api/notice/:id
// @access  Private/Admin
exports.updateNotice = async (req, res, next) => {
  try {
    let notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }

    const { logAdminAction } = require('../utils/auditLogger');
    const oldData = { content: notice.content, url: notice.url, icon: notice.icon, color: notice.color };

    notice = await Notice.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    // Log update audit trail
    await logAdminAction({
      adminId: req.user._id,
      role: req.user.role,
      actionType: 'update',
      targetCollection: 'notices',
      targetId: notice._id.toString(),
      oldData,
      newData: { content: notice.content, url: notice.url, icon: notice.icon, color: notice.color },
      req
    });

    res.status(200).json({ success: true, data: notice });
  } catch (err) {
    next(err);
  }
};
