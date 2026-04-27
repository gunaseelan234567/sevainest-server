const express = require('express');
const { getActiveNotices, createNotice, deleteNotice } = require('../controllers/noticeController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/active', getActiveNotices);
router.post('/', authorize('admin'), createNotice);
router.delete('/:id', authorize('admin'), deleteNotice);

module.exports = router;
