const express = require('express');
const dotenv = require('dotenv');

// Load env vars immediately so configurations have access
dotenv.config();

const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

// Validate required environment variables
const requiredEnv = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRE',
  'PORT',
  'NODE_ENV',
  'RESEND_API_KEY',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET'
];

const missingEnv = requiredEnv.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
  console.error(`ERROR: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

if (process.env.AWS_ACCESS_KEY_ID === 'YOUR_ACCESS_KEY_ID') {
  console.warn('⚠️ Warning: AWS_ACCESS_KEY_ID is set to placeholder "YOUR_ACCESS_KEY_ID". S3 file uploads will fail until valid credentials are provided.');
}

// Connect to database
connectDB();

const app = express();
app.set('trust proxy', 1); // Trust Railway's proxy for correct rate limiting IP detection

// Enable CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  // sevainestt.in (double-T) — production domain
  'https://www.sevainestt.in',
  'https://sevainestt.in',
  // sevainest.in (single-T) — legacy / alternate
  'https://www.sevainest.in',
  'https://sevainest.in',
  'https://api.sevainest.in',
  'https://api.sevainestt.in',
  'https://sevainest.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
].map(url => url?.replace(/\/$/, '')) // Remove trailing slashes
  .filter(Boolean);

console.log('✅ Allowed Origins:', allowedOrigins);

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(normalized)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?sevainest(t)?\.in(:\d+)?$/i.test(normalized)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?vercel\.app$/i.test(normalized)) return true;
  if (/^http:\/\/localhost(:\d+)?$/i.test(normalized)) return true;
  return false;
};

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    } else {
      console.log(`❌ CORS Blocked for origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-critical-action-token'],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Allow images to load from cross-origin
}));

// Sanitize data
app.use(mongoSanitize());

// Prevent http param pollution
app.use(hpp());

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 mins
  max: 100000, // Elevated to prevent 429 errors from shared proxy IP addresses
  message: 'Too many requests from this IP, please try again after 10 minutes'
});
app.use('/api', limiter);

// Specific rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 50000, // Elevated to prevent false-positives under development/high load
  message: 'Too many login attempts, please try again after 15 minutes'
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgotpassword', authLimiter);
app.use('/api/auth/send-verification', authLimiter);
app.use('/api/auth/verify-email', authLimiter);

// Compression
app.use(compression());

// Static Folders removed - App is 100% Supabase Cloud Storage now.

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Sevainest API' });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/instant-services', require('./routes/instantServiceRoutes'));
app.use('/api/applications', require('./routes/applicationRoutes'));
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/notice', require('./routes/noticeRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/pdfs', require('./routes/pdfRoutes'));
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/finance', require('./routes/financeRoutes'));
app.use('/api/admin/card-processing', require('./routes/cardProcessingAdminRoutes'));
app.use('/api/agent/card-processing', require('./routes/cardProcessingAgentRoutes'));


// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log to console for dev
  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error.message = `Resource not found with id of ${err.value}`;
    res.status(404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    error.message = `Duplicate ${field} value entered. Please check your data.`;
    res.status(400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(val => val.message);
    res.status(400);
  }

  // Multer File Upload errors
  if (err.name === 'MulterError') {
    res.status(400);
    if (err.code === 'LIMIT_FILE_SIZE') {
      error.message = 'File upload failed: file size exceeds the allowed limit.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      error.message = 'File upload failed: too many files uploaded.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      error.message = `File upload failed: unexpected field '${err.field}'.`;
    } else {
      error.message = `File upload error: ${err.message}`;
    }
  }

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`📡 Deployment URL: ${process.env.FRONTEND_URL || 'Localhost'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  // server.close(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
