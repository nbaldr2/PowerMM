import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { query } from '../config/database.js';
import { hashToken } from '../utils/encryption.js';
import logger from '../utils/logger.js';

/**
 * JWT authentication middleware.
 * If no token is provided, assigns a default guest user so the app works without login.
 */
export function authenticate(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    req.user = { id: null, role: 'admin', email: 'guest@local' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    req.user = { id: null, role: 'admin', email: 'guest@local' };
    next();
  }
}

/**
 * Role-based authorization middleware.
 * When no token is present (guest mode), grants access to everyone.
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.id === null) {
      return next();
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * API key authentication middleware (for /api/ routes).
 */
export async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    // Fall back to JWT auth
    return authenticate(req, res, next);
  }

  try {
    const keyHash = hashToken(apiKey);
    const { rows } = await query(
      `SELECT ak.*, u.role, u.quota_daily, u.is_active 
       FROM api_keys ak 
       JOIN users u ON ak.user_id = u.id 
       WHERE ak.key_hash = $1 AND ak.is_active = TRUE AND u.is_active = TRUE`,
      [keyHash]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const key = rows[0];
    req.user = {
      id: key.user_id,
      role: key.role,
      permissions: key.permissions,
      quota_daily: key.quota_daily,
      via: 'api_key',
    };

    // Update last_used_at
    await query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]);

    next();
  } catch (err) {
    logger.error('API key auth error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Quota check middleware — ensures user hasn't exceeded daily email quota.
 */
export async function checkQuota(req, res, next) {
  if (!req.user) return next();

  try {
    const { rows } = await query(
      'SELECT quota_daily, quota_used_today, quota_reset_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return next();

    const user = rows[0];

    // Reset quota if it's a new day
    const now = new Date();
    const resetAt = new Date(user.quota_reset_at);
    if (now.toDateString() !== resetAt.toDateString()) {
      await query(
        'UPDATE users SET quota_used_today = 0, quota_reset_at = NOW() WHERE id = $1',
        [req.user.id]
      );
      user.quota_used_today = 0;
    }

    req.userQuota = {
      daily: user.quota_daily,
      used: user.quota_used_today,
      remaining: user.quota_daily - user.quota_used_today,
    };

    next();
  } catch (err) {
    logger.error('Quota check error:', err);
    next();
  }
}
