const express = require('express');
const { getActiveNotices, createNotice, deleteNotice, restoreNotice, updateNotice } = require('../controllers/noticeController');
const { protect, authorize } = require('../middleware/auth');
const { deleteRateLimiter, verifyAdminDelete } = require('../middleware/deleteGuard');

const router = express.Router();

router.use(protect);

router.get('/active', getActiveNotices);
router.post('/', authorize('admin'), createNotice);
router.put('/:id', authorize('admin'), updateNotice);
router.delete('/:id', authorize('admin'), deleteRateLimiter, verifyAdminDelete({ targetType: 'notice', requireDoubleConfirm: false }), deleteNotice);
router.patch('/:id/restore', authorize('admin'), restoreNotice);

module.exports = router;
