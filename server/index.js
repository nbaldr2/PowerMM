import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import env from './config/env.js';
import { testConnection } from './config/database.js';
import redis from './config/redis.js';
import { initSocketIO } from './socket/index.js';
import logger from './utils/logger.js';

// Routes
import authRoutes from './routes/auth.js';
import smtpRoutes from './routes/smtp.js';
import campaignRoutes from './routes/campaigns.js';
import listRoutes from './routes/lists.js';
import trackingRoutes from './routes/tracking.js';
import pmtaRoutes from './routes/pmta.js';
import analyticsRoutes from './routes/analytics.js';
import ipCheckerRoutes from './routes/ipchecker.js';
import spamCheckRoutes from './routes/spamcheck.js';
import dnsRoutes from './routes/dns.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for tracking pixel
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression({
  filter: (req, res) => {
    const accept = req.headers.accept || '';
    if (accept.includes('text/event-stream')) return false;
    return compression.filter(req, res);
  },
}));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [env.APP_URL, 'http://localhost:5173', 'http://localhost:3000', 'http://109.71.254.177'];
    if (!origin || allowed.includes(origin) || origin.startsWith('http://109.71.254.177')) return callback(null, true);
    return callback(null, allowed[0]);
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Trust the nginx reverse proxy so X-Forwarded-For headers are accepted
// Set to 1 (single nginx proxy) to avoid express-rate-limit validation error
app.set('trust proxy', 1);

// Global rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// Request logging
app.use((req, res, next) => {
  if (!req.url.startsWith('/track/')) {
    logger.debug(`${req.method} ${req.url} from ${req.ip}`);
  }
  next();
});

// ============================================================
// ROUTES
// ============================================================

// Health check
app.get('/health', async (req, res) => {
  const dbOk = await testConnection();
  let redisOk = false;
  try { await redis.ping(); redisOk = true; } catch {}
  res.json({
    status: dbOk && redisOk ? 'healthy' : 'degraded',
    version: '1.0.0',
    services: { database: dbOk ? 'up' : 'down', redis: redisOk ? 'up' : 'down' },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/auth', authLimiter, authRoutes);
app.use('/smtp', smtpRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/lists', listRoutes);
app.use('/track', trackingRoutes);
app.use('/pmta', pmtaRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/ipchecker', ipCheckerRoutes);
app.use('/spamcheck', spamCheckRoutes);
app.use('/api/dns', dnsRoutes);

// Serve uploaded files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Serve PowerMTA installation files (extracted directory)
const pmtaFilesPath = path.join(__dirname, '..', 'PowerMTA5.0r8_ALMALINUX');
if (fs.existsSync(pmtaFilesPath)) {
  app.use('/pmta-files', express.static(pmtaFilesPath));
}

// Serve PowerMTA5.zip directly from project root if present
const pmtaZipPath = path.join(__dirname, '..', 'PowerMTA5.zip');
if (fs.existsSync(pmtaZipPath)) {
  app.get('/pmta-files/PowerMTA5.zip', (req, res) => {
    res.download(pmtaZipPath);
  });
}

// Serve frontend build (production)
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  const apiPrefixes = ['/auth', '/smtp', '/campaigns', '/lists', '/track', '/pmta', '/analytics', '/ipchecker', '/spamcheck', '/health', '/uploads', '/socket.io'];
  app.get('{*path}', (req, res) => {
    const isApi = apiPrefixes.some(p => req.url.startsWith(p));
    if (!isApi) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ============================================================
// START SERVER
// ============================================================

// Initialize Socket.io
initSocketIO(httpServer);

// Create log directory
if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });

httpServer.listen(env.PORT, async () => {
  logger.info(`🌙 MoonMailer Pro API server running on port ${env.PORT}`);
  logger.info(`   Environment: ${env.NODE_ENV}`);
  logger.info(`   Frontend:    ${env.APP_URL}`);
  logger.info(`   Tracking:    ${env.TRACKING_DOMAIN}`);

  // Test database connection
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.warn('⚠️ Database not connected. Run migrations: npm run migrate');
  }

  // Test Redis
  try {
    await redis.ping();
    logger.info('✅ Redis connected');
  } catch (err) {
    logger.warn('⚠️ Redis not connected:', err.message);
  }
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  httpServer.close();
  await redis.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
