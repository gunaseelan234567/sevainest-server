const { z } = require('zod');

/**
 * Validation middleware factory.
 * Usage: router.post('/login', validate(schemas.login), loginController)
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    return res.status(400).json({ success: false, message: errors[0], errors });
  }
  req.body = result.data; // Use sanitized/coerced data
  next();
};

// ─── Auth Schemas ──────────────────────────────────────────────────────────
const schemas = {
  login: z.object({
    email: z.string().email('Please provide a valid email').toLowerCase().trim(),
    password: z.string().min(1, 'Password is required'),
  }),

  register: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').trim(),
    email: z.string().email('Please provide a valid email').toLowerCase().trim(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['admin', 'agent']).optional().default('agent'),
    phone: z.string().optional(),
    shopAddress: z.string().optional(),
  }),

  registerAgent: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').trim(),
    email: z.string().email('Please provide a valid email').toLowerCase().trim(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    phone: z.string().min(10, 'Please provide a valid phone number'),
    shopAddress: z.string().min(5, 'Please provide your shop address').trim(),
    paymentMode: z.enum(['online', 'offline', 'free']).optional().default('offline'),
  }),

  forgotPassword: z.object({
    email: z.string().email('Please provide a valid email').toLowerCase().trim(),
  }),

  resetPassword: z.object({
    email: z.string().email('Please provide a valid email').toLowerCase().trim(),
    otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),

  bulkEmail: z.object({
    userIds: z.array(z.string()).min(1, 'Please select at least one agent'),
    subject: z.string().min(3, 'Subject must be at least 3 characters').trim(),
    message: z.string().min(10, 'Message must be at least 10 characters').trim(),
  }),

  verifyEmail: z.object({
    otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  }),

  // ─── Wallet Schemas ─────────────────────────────────────────────────────
  adminFunds: z.object({
    userId: z.string().min(1, 'User ID is required'),
    amount: z.number({ invalid_type_error: 'Amount must be a number' }).positive('Amount must be positive'),
    reason: z.string().optional(),
  }),

  onlineOrder: z.object({
    amount: z.number({ invalid_type_error: 'Amount must be a number' }).min(50, 'Minimum wallet load amount is Rs.50'),
  }),

  offlineRequest: z.object({
    amount: z.coerce.number().min(50, 'Minimum wallet load amount is Rs.50'),
    transactionId: z.string().min(1, 'Please provide a transaction reference').trim(),
  }),

  verifyCashfree: z.object({
    order_id: z.string().min(1, 'Order ID is required'),
  }),

  fundRequestStatus: z.object({
    status: z.enum(['approved', 'rejected'], { message: 'Status must be approved or rejected' }),
    adminRemark: z.string().optional(),
  }),

  // ─── Application Schemas ────────────────────────────────────────────────
  updateApplicationStatus: z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'returned'], { message: 'Invalid status' }),
    adminRemark: z.string().optional(),
  }),
};

module.exports = { validate, schemas };
