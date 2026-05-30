const express = require('express');
const {
  getPdfs,
  createPdf,
  updatePdf,
  deletePdf,
  restorePdf,
  downloadPdf
} = require('../controllers/pdfController');
const { protect, authorize } = require('../middleware/auth');
const { deleteRateLimiter, verifyAdminDelete } = require('../middleware/deleteGuard');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', getPdfs);
router.post('/', authorize('admin'), upload.fields([{ name: 'pdfFile', maxCount: 1 }, { name: 'pdfImage', maxCount: 1 }]), createPdf);

router
  .route('/:id')
  .put(authorize('admin'), upload.fields([{ name: 'pdfFile', maxCount: 1 }, { name: 'pdfImage', maxCount: 1 }]), updatePdf)
  .delete(authorize('admin'), deleteRateLimiter, verifyAdminDelete({ targetType: 'pdf', requireDoubleConfirm: false }), deletePdf);

router.patch('/:id/restore', authorize('admin'), restorePdf);

router.post('/:id/download', downloadPdf);

module.exports = router;
