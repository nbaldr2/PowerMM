import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  APP_URL: process.env.APP_URL || 'http://localhost:5173',
  API_URL: process.env.API_URL || 'http://localhost:3001',

  // PostgreSQL
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://powermm:powermm_secret@localhost:5432/powermm',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'powermm',
  DB_USER: process.env.DB_USER || 'powermm',
  DB_PASS: process.env.DB_PASS || 'powermm_secret',

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'moonmailer-pro-jwt-secret-change-in-production-2026',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'moonmailer-pro-refresh-secret-change-2026',
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',

  // Encryption
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', // 32 bytes hex

  // Tracking
  TRACKING_DOMAIN: process.env.TRACKING_DOMAIN || 'http://localhost:3001',

  // SpamAssassin
  SPAMASSASSIN_HOST: process.env.SPAMASSASSIN_HOST || 'localhost',
  SPAMASSASSIN_PORT: parseInt(process.env.SPAMASSASSIN_PORT || '783', 10),

  // AI Advisor
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

  // SMTP default
  SMTP_FROM_DEFAULT: process.env.SMTP_FROM_DEFAULT || 'noreply@moonmailer.pro',

  // File storage
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_UPLOAD_SIZE: parseInt(process.env.MAX_UPLOAD_SIZE || '52428800', 10), // 50MB

  PMTA_LICENSE_PATH: process.env.PMTA_LICENSE_PATH || '',
  PMTA_LICENSE_CONTENT: process.env.PMTA_LICENSE_CONTENT || '',
};

export default env;
