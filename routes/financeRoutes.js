const express = require('express');
const { getFinanceStats } = require('../controllers/financeController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.get('/stats', getFinanceStats);

module.exports = router;
