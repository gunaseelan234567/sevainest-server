const Notice = require('../models/Notice');

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

// @desc    Delete notice (Admin)
// @route   DELETE /api/notice/:id
// @access  Private/Admin
exports.deleteNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};
