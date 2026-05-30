const express = require('express');
const { getAuditLogs, exportAuditLogs } = require('../controllers/auditLogController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('admin'), getAuditLogs);
router.get('/export', protect, authorize('admin'), exportAuditLogs);

module.exports = router;
