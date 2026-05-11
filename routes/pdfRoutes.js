const express = require('express');
const {
  getPdfs,
  createPdf,
  updatePdf,
  deletePdf,
  downloadPdf
} = require('../controllers/pdfController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.get('/', getPdfs);
router.post('/', authorize('admin'), upload.fields([{ name: 'pdfFile', maxCount: 1 }, { name: 'pdfImage', maxCount: 1 }]), createPdf);

router
  .route('/:id')
  .put(authorize('admin'), upload.fields([{ name: 'pdfFile', maxCount: 1 }, { name: 'pdfImage', maxCount: 1 }]), updatePdf)
  .delete(authorize('admin'), deletePdf);

router.post('/:id/download', downloadPdf);

module.exports = router;
