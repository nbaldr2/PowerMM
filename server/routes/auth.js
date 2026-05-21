import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { hashToken, generateToken } from '../utils/encryption.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const router = Router();

// POST /auth/login
router.post('/login', validate(schemas.login), async (req, res) => {
  const { email, password } = req.validated;
  try {
    const { rows } = await query('SELECT * FROM users WHERE email = $1 AND is_active = TRUE', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      env.JWT_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRY }
    );
    const refreshToken = generateToken(48);

    // Store session
    await query(
      `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, device, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '7 days')`,
      [user.id, hashToken(accessToken), hashToken(refreshToken),
       req.headers['sec-ch-ua-platform'] || 'Unknown',
       req.ip, req.headers['user-agent']]
    );

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Set cookies
    res.cookie('access_token', accessToken, {
      httpOnly: true, secure: env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true, secure: env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    logger.info(`User ${email} logged in from ${req.ip}`);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, quota_daily: user.quota_daily },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/register (admin only can create users, or first user)
router.post('/register', validate(schemas.register), async (req, res) => {
  const { email, password, name } = req.validated;
  try {
    // Check if any users exist (allow first user registration without auth)
    const { rows: existing } = await query('SELECT COUNT(*) as count FROM users');
    const isFirst = parseInt(existing[0].count) === 0;

    if (!isFirst) {
      // Require admin auth for subsequent registrations
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Admin auth required' });
      try {
        const decoded = jwt.verify(authHeader.replace('Bearer ', ''), env.JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
      } catch { return res.status(401).json({ error: 'Invalid token' }); }
    }

    const hash = await bcrypt.hash(password, 12);
    const role = isFirst ? 'admin' : 'operator';

    const { rows } = await query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
      [email, hash, name, role]
    );

    logger.info(`User registered: ${email} (${role})`);
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    logger.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  try {
    const tokenHash = hashToken(refreshToken);
    const { rows } = await query(
      `SELECT s.*, u.email, u.name, u.role FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.refresh_token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid refresh token' });

    const session = rows[0];
    const newAccessToken = jwt.sign(
      { id: session.user_id, email: session.email, role: session.role, name: session.name },
      env.JWT_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRY }
    );

    // Update session
    await query('UPDATE sessions SET token_hash = $1, last_seen_at = NOW() WHERE id = $2',
      [hashToken(newAccessToken), session.id]);

    res.cookie('access_token', newAccessToken, {
      httpOnly: true, secure: env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: 15 * 60 * 1000,
    });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    logger.error('Token refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, role, quota_daily, quota_used_today, created_at, last_login_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (req, res) => {
  const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  }
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.json({ message: 'Logged out' });
});

// GET /auth/sessions
router.get('/sessions', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT id, device, ip_address, user_agent, last_seen_at, created_at FROM sessions WHERE user_id = $1 ORDER BY last_seen_at DESC',
    [req.user.id]
  );
  res.json({ sessions: rows });
});

// DELETE /auth/sessions/:id
router.delete('/sessions/:id', authenticate, async (req, res) => {
  await query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ message: 'Session revoked' });
});

export default router;
