import nodemailer from 'nodemailer';
import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate, authorize, checkQuota } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { testSmtpConnection } from '../services/email.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';

const router = Router();

// GET /smtp — list SMTP servers for current user
router.get('/', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, host, port, encryption, username, pool_name, weight, daily_limit,
            sent_today, bounce_rate, max_bounce_rate, status, latency_ms, is_enabled,
            last_checked_at, created_at
     FROM smtp_servers WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ servers: rows });
});

// POST /smtp — add SMTP server
router.post('/', authenticate, authorize('admin', 'operator'), validate(schemas.smtpServer), async (req, res) => {
  const data = req.validated;
  const passwordEncrypted = data.password ? encrypt(data.password) : null;

  const { rows } = await query(
    `INSERT INTO smtp_servers (user_id, name, host, port, encryption, username, password_encrypted, pool_name, weight, daily_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [req.user.id, data.name || 'Default', data.host, data.port, data.encryption,
     data.username, passwordEncrypted, data.pool_name, data.weight, data.daily_limit]
  );
  logger.info(`SMTP server added: ${data.host}:${data.port} by ${req.user.email}`);
  res.status(201).json({ server: rows[0] });
});

// PUT /smtp/:id — update SMTP server
router.put('/:id', authenticate, authorize('admin', 'operator'), async (req, res) => {
  const data = req.body;
  const sets = [];
  const vals = [];
  let idx = 1;

  for (const field of ['name', 'host', 'port', 'encryption', 'username', 'pool_name', 'weight', 'daily_limit', 'max_bounce_rate', 'is_enabled']) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${idx++}`);
      vals.push(data[field]);
    }
  }
  if (data.password) {
    sets.push(`password_encrypted = $${idx++}`);
    vals.push(encrypt(data.password));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  sets.push(`updated_at = NOW()`);
  vals.push(req.params.id, req.user.id);

  const { rows } = await query(
    `UPDATE smtp_servers SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    vals
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Server not found' });
  res.json({ server: rows[0] });
});

// DELETE /smtp/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  await query('DELETE FROM smtp_servers WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ message: 'Server deleted' });
});

// POST /smtp/:id/test — test SMTP connection
router.post('/:id/test', authenticate, async (req, res) => {
  const { rows } = await query('SELECT * FROM smtp_servers WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Server not found' });

  const server = rows[0];
  const result = await testSmtpConnection(server);

  // Update status in DB
  await query(
    'UPDATE smtp_servers SET status = $1, latency_ms = $2, last_checked_at = NOW() WHERE id = $3',
    [result.success ? 'connected' : 'auth_failed', result.latency, server.id]
  );

  res.json(result);
});

// POST /smtp/test-inline — test SMTP from form fields (without saving)
router.post('/test-inline', authenticate, async (req, res) => {
  const { host, port, encryption, username, password } = req.body;
  const result = await testSmtpConnection({
    host, port: port || 587, encryption: encryption || 'NONE',
    username, password_encrypted: null, password,
  });
  res.json(result);
});

// POST /smtp/fill-pmta — auto-populate from PMTA config
router.post('/fill-pmta', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM pmta_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No PMTA config found' });

  const pmta = rows[0];
  res.json({
    host: pmta.ssh_host || '127.0.0.1',
    port: pmta.smtp_port || 2525,
    encryption: 'NONE',
    username: pmta.smtp_user || '',
    password: pmta.smtp_pass_encrypted ? decrypt(pmta.smtp_pass_encrypted) : '',
  });
});

// GET /smtp/pools — list all pool names with server counts
router.get('/pools', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT pool_name, COUNT(*) as server_count, 
            SUM(sent_today) as total_sent, AVG(bounce_rate) as avg_bounce
     FROM smtp_servers WHERE user_id = $1 AND is_enabled = TRUE
     GROUP BY pool_name ORDER BY pool_name`,
    [req.user.id]
  );
  res.json({ pools: rows });
});

// POST /smtp/test-send — send a test email and return detailed logs
router.post('/test-send', authenticate, async (req, res) => {
  const { host, port, encryption, username, password, to, subject, body } = req.body;
  const logs = [`Connecting to ${host}:${port}...`];

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: encryption === 'SSL',
      requireTLS: encryption === 'TLS',
      auth: username ? { user: username, pass: password || '' } : undefined,
      tls: env.NODE_ENV !== 'production' ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    logs.push(`Authenticating as ${username || 'anonymous'}...`);

    const info = await transporter.sendMail({
      from: username || `test@${host}`,
      to: to || 'baldr@proton.me',
      subject: subject || 'SMTP Test',
      text: body || `Your SMTP FROM ${host} is working.`,
    });

    logs.push(`Message sent: ${info.messageId}`);
    logs.push('✅ SMTP is fully functional');

    return res.json({ success: true, messageId: info.messageId, logs });
  } catch (err) {
    const msg = err.message || 'Unknown error';
    if (msg.includes('timeout') || msg.includes('Timed out')) {
      logs.push('❌ Connection timed out. Check firewall/network.');
    } else if (msg.includes('DNS') || msg.includes('dns') || msg.includes('ENOTFOUND')) {
      logs.push('❌ DNS lookup failed. Check server address.');
    } else if (msg.includes('auth') || msg.includes('Authentication') || msg.includes('AUTH')) {
      logs.push('❌ Authentication failed. Check username/password.');
    } else if (msg.includes('connect') || msg.includes('Connection') || msg.includes('ECONNREFUSED')) {
      logs.push('❌ Could not connect to server. Check port/host.');
    } else {
      logs.push(`❌ SMTP error: ${msg}`);
    }
    return res.status(200).json({ success: false, error: msg, logs });
  }
});

export default router;
