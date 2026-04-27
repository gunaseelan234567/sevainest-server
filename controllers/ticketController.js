const Ticket = require('../models/Ticket');
const sendEmail = require('../utils/sendEmail');

// @desc    Get agent tickets
// @route   GET /api/tickets/my
// @access  Private/Agent
exports.getMyTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.find({ agentId: req.user.id }).sort('-createdAt');
    res.status(200).json({ success: true, data: tickets });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all tickets (Admin)
// @route   GET /api/tickets
// @access  Private/Admin
exports.getAllTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.find().populate('agentId', 'name email').sort('-createdAt');
    res.status(200).json({ success: true, data: tickets });
  } catch (err) {
    next(err);
  }
};

// @desc    Create ticket
// @route   POST /api/tickets
// @access  Private/Agent
exports.createTicket = async (req, res, next) => {
  try {
    req.body.agentId = req.user.id;
    const ticket = await Ticket.create(req.body);
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
};

// @desc    Respond to ticket (Admin)
// @route   PATCH /api/tickets/:id/respond
// @access  Private/Admin
exports.respondToTicket = async (req, res, next) => {
  try {
    const { adminResponse, status } = req.body;
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { adminResponse, status: status || 'resolved' },
      { new: true }
    ).populate('agentId', 'name email');

    // Notify agent via email
    try {
      if (ticket && ticket.agentId) {
        await sendEmail({
          email: ticket.agentId.email,
          subject: `Support Ticket Update: ${ticket.subject}`,
          message: `Hello ${ticket.agentId.name},\n\nAdmin has responded to your support ticket regarding "${ticket.subject}".\n\nResponse: ${adminResponse}\nStatus: ${ticket.status.toUpperCase()}\n\nPlease log in to your dashboard to view the full details.\n\nBest regards,\nSevainest Support Team`,
        });
      }
    } catch (err) {
      console.error('Ticket response email could not be sent');
    }

    res.status(200).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
};
