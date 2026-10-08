const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

// Route files
const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow inline styles/scripts for dev
  })
);

// CORS configuration
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// Rate limiting for Auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'OddJobs API server is healthy and running',
    timestamp: new Date(),
  });
});

// Development seed endpoint
app.post('/api/seed', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: 'Forbidden in production' });
  }
  try {
    const User = require('./models/User');
    const Service = require('./models/Service');
    const count = await User.countDocuments();
    if (count === 0) {
      const provider = await User.create({
        name: 'Alex Rivera',
        email: 'alex.electric@oddjobs.com',
        password: 'Password123!',
        role: 'service_provider',
        phone: '+1 555-0199',
        location: 'Northside, City',
        bio: 'Licensed Master Electrician',
      });
      await Service.create({
        title: 'Emergency Electrical Wiring & Circuit Fix',
        description: 'Complete electrical troubleshooting and circuit breaker repair.',
        category: 'Electrician',
        price: 85,
        priceType: 'hourly',
        location: 'Northside, City',
        provider: provider._id,
      });
    }
    res.status(200).json({ success: true, message: 'Database seeded for development' });
  } catch (err) {
    next(err);
  }
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
