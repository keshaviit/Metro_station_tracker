require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');

const connectDB = require('./src/config/db');
const logger = require('./src/config/logger');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const stationRoutes = require('./src/routes/stationRoutes');
const tripRoutes = require('./src/routes/tripRoutes');
const authRoutes = require('./src/routes/authRoutes');
const { predictionEngine } = require('./src/services/predictionEngine');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── CORS & Allowed Origins ────────────────────────────────────────────────────
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.includes(origin) ||
                      origin.endsWith('.vercel.app') ||
                      origin === 'http://localhost' ||
                      origin === 'https://localhost' ||
                      origin.startsWith('http://localhost:');

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io); // accessible in controllers via req.app.get('io')

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Client joins a trip room to receive trip-specific events
  socket.on('join-trip', (tripId) => {
    socket.join(tripId);
    logger.info(`Socket ${socket.id} joined trip room: ${tripId}`);
  });

  // Client sends GPS update via socket (alternative to REST)
  socket.on('gps-update', ({ tripId, lat, lng, accuracy }) => {
    if (!tripId || lat == null || lng == null) return;
    const prediction = predictionEngine.predictCurrentStation(tripId, lat, lng, accuracy || 50);
    socket.to(tripId).emit('location-update', prediction);
    io.to(tripId).emit('prediction', prediction);

    if (prediction.shouldAlert) {
      io.to(tripId).emit('destination-alert', {
        message: `Only ${prediction.stopsRemaining} stop(s) to destination!`,
        stopsRemaining: prediction.stopsRemaining,
      });
    }
  });

  socket.on('leave-trip', (tripId) => {
    socket.leave(tripId);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Rate limiting ──────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/trips', tripRoutes);

// ── Error handling ─────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Connect DB & Start ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚇 Metro Tracker API running on port ${PORT}`);
      logger.info(`🔌 Socket.IO enabled`);
    });
  })
  .catch((err) => {
    logger.error(`MongoDB connection failed: ${err.message}`);
    // Start server anyway to show error responses instead of nothing
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚇 Metro Tracker API running on port ${PORT} (DB offline)`);
    });
  });

module.exports = app;
