const express = require('express');
const { getMyTickets, getAllTickets, createTicket, respondToTicket } = require('../controllers/ticketController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/my', authorize('agent'), getMyTickets);
router.get('/', authorize('admin'), getAllTickets);
router.post('/', authorize('agent'), createTicket);
router.patch('/:id/respond', authorize('admin'), respondToTicket);

module.exports = router;
