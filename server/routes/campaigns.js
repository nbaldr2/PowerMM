import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate, authorize, checkQuota } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { Queue } from 'bullmq';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';

const router = Router();
const sendQueue = new Queue('email-send', { connection: redis });

// GET /campaigns — list campaigns
router.get('/', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const status = req.query.status;

  let where = 'WHERE c.user_id = $1';
  const params = [req.user.id];
  if (status) {
    where += ` AND c.status = $${params.length + 1}`;
    params.push(status);
  }

  const { rows } = await query(
    `SELECT c.*, rl.name as list_name
     FROM campaigns c LEFT JOIN recipient_lists rl ON c.list_id = rl.id
     ${where} ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await query(`SELECT COUNT(*) FROM campaigns c ${where}`, params);
  res.json({ campaigns: rows, total: parseInt(countRows[0].count), page, limit });
});

// GET /campaigns/:id
router.get('/:id', authenticate, async (req, res) => {
  const { rows } = await query('SELECT * FROM campaigns WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
  res.json({ campaign: rows[0] });
});

// POST /campaigns — create campaign
router.post('/', authenticate, authorize('admin', 'operator'), validate(schemas.campaign), async (req, res) => {
  const d = req.validated;
  try {
    let listId = d.list_id || null;
    let totalRecipients = 0;

    // If recipients_raw provided, create an inline list
    if (d.recipients_raw && !listId) {
      const emails = d.recipients_raw.split('\n').map(e => e.trim()).filter(e => e.includes('@'));
      if (emails.length > 0) {
        const listResult = await transaction(async (client) => {
          const { rows: lr } = await client.query(
            `INSERT INTO recipient_lists (user_id, name, record_count) VALUES ($1, $2, $3) RETURNING id`,
            [req.user.id, `Campaign: ${d.name}`, emails.length]
          );
          const lid = lr[0].id;
          for (const email of emails) {
            const parts = email.split('@');
            await client.query(
              `INSERT INTO recipients (list_id, email, email_user, email_domain, domain)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
              [lid, email, parts[0], parts[1], parts[1]]
            );
          }
          return lid;
        });
        listId = listResult;
        totalRecipients = emails.length;
      }
    } else if (listId) {
      const { rows: lr } = await query('SELECT record_count FROM recipient_lists WHERE id = $1', [listId]);
      totalRecipients = lr[0]?.record_count || 0;
    }

    const { rows } = await query(
      `INSERT INTO campaigns (user_id, name, subject, from_email, from_name, reply_to,
         html_body, text_body, custom_headers, redirect_url, logo_url, list_id,
         smtp_server_id, pool_name, inbox_shield, content_randomizer, creative_engine,
         batch_settings, seed_settings, total_recipients)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [req.user.id, d.name, d.subject, d.from_email, d.from_name || '', d.reply_to || '',
       d.html_body, d.text_body || '', d.custom_headers || '', d.redirect_url || '',
       d.logo_url || '', listId, d.smtp_server_id || null, d.pool_name || 'default',
       JSON.stringify(d.inbox_shield || {}), JSON.stringify(d.content_randomizer || {}),
       JSON.stringify(d.creative_engine || {}), JSON.stringify(d.batch_settings || {}),
       JSON.stringify(d.seed_settings || {}), totalRecipients]
    );

    logger.info(`Campaign created: ${d.name} by ${req.user.email}`);
    res.status(201).json({ campaign: rows[0] });
  } catch (err) {
    logger.error('Campaign creation error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// POST /campaigns/:id/send — trigger campaign send
router.post('/:id/send', authenticate, authorize('admin', 'operator'), checkQuota, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM campaigns WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    const campaign = rows[0];

    if (campaign.status === 'sending') return res.status(400).json({ error: 'Campaign already sending' });
    if (!campaign.list_id) return res.status(400).json({ error: 'No recipient list assigned' });
    if (!campaign.html_body) return res.status(400).json({ error: 'No email body' });

    // Check SMTP
    let smtpOk = false;
    if (campaign.smtp_server_id) {
      const { rows: sr } = await query('SELECT id FROM smtp_servers WHERE id = $1 AND is_enabled = TRUE', [campaign.smtp_server_id]);
      smtpOk = sr.length > 0;
    } else {
      const { rows: sr } = await query(
        'SELECT id FROM smtp_servers WHERE user_id = $1 AND pool_name = $2 AND is_enabled = TRUE LIMIT 1',
        [req.user.id, campaign.pool_name || 'default']
      );
      smtpOk = sr.length > 0;
    }
    if (!smtpOk) return res.status(400).json({ error: 'No active SMTP server configured' });

    // Check quota
    if (req.userQuota && req.userQuota.remaining < campaign.total_recipients) {
      return res.status(429).json({ error: `Daily quota insufficient. Remaining: ${req.userQuota.remaining}` });
    }

    // Update status
    await query("UPDATE campaigns SET status = 'sending', started_at = NOW() WHERE id = $1", [campaign.id]);

    // Enqueue BullMQ job
    const batchSettings = campaign.batch_settings || {};
    await sendQueue.add('send-campaign', {
      campaignId: campaign.id,
      userId: req.user.id,
      batchSize: batchSettings.batchSize || 1000,
      speedMode: batchSettings.speedMode || 'Normal',
      batchDelay: batchSettings.batchDelay || 100,
      emailDelay: batchSettings.emailDelay || 10,
      keepAlive: batchSettings.keepAlive !== false,
    }, {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });

    logger.info(`Campaign ${campaign.id} send triggered by ${req.user.email}`);
    res.json({ message: 'Campaign send started', campaignId: campaign.id });
  } catch (err) {
    logger.error('Campaign send error:', err);
    res.status(500).json({ error: 'Failed to start send' });
  }
});

// POST /campaigns/:id/pause
router.post('/:id/pause', authenticate, async (req, res) => {
  await query("UPDATE campaigns SET status = 'paused' WHERE id = $1 AND user_id = $2 AND status = 'sending'",
    [req.params.id, req.user.id]);
  res.json({ message: 'Campaign paused' });
});

// POST /campaigns/:id/resume
router.post('/:id/resume', authenticate, async (req, res) => {
  const { rows } = await query("SELECT * FROM campaigns WHERE id = $1 AND user_id = $2 AND status = 'paused'",
    [req.params.id, req.user.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Campaign not found or not paused' });

  await query("UPDATE campaigns SET status = 'sending' WHERE id = $1", [rows[0].id]);
  await sendQueue.add('send-campaign', {
    campaignId: rows[0].id, userId: req.user.id,
    resumeFromOffset: rows[0].last_processed_offset,
    ...(rows[0].batch_settings || {}),
  });
  res.json({ message: 'Campaign resumed' });
});

// POST /campaigns/:id/cancel
router.post('/:id/cancel', authenticate, async (req, res) => {
  await query("UPDATE campaigns SET status = 'cancelled', completed_at = NOW() WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id]);
  res.json({ message: 'Campaign cancelled' });
});

// GET /campaigns/:id/stats
router.get('/:id/stats', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT status, COUNT(*) as count FROM send_log WHERE campaign_id = $1 GROUP BY status`,
    [req.params.id]
  );
  const stats = {};
  for (const r of rows) stats[r.status] = parseInt(r.count);

  const { rows: openRows } = await query(
    `SELECT COUNT(DISTINCT send_log_id) as unique_opens FROM tracking_events WHERE campaign_id = $1 AND event_type = 'open'`,
    [req.params.id]
  );
  const { rows: clickRows } = await query(
    `SELECT COUNT(DISTINCT send_log_id) as unique_clicks FROM tracking_events WHERE campaign_id = $1 AND event_type = 'click'`,
    [req.params.id]
  );

  res.json({
    ...stats,
    unique_opens: parseInt(openRows[0]?.unique_opens || 0),
    unique_clicks: parseInt(clickRows[0]?.unique_clicks || 0),
  });
});

// GET /campaigns/:id/logs — send log per recipient
router.get('/:id/logs', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const status = req.query.status;

  let where = 'WHERE campaign_id = $1';
  const params = [req.params.id];
  if (status) { where += ` AND status = $${params.length + 1}`; params.push(status); }

  const { rows } = await query(
    `SELECT * FROM send_log ${where} ORDER BY sent_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json({ logs: rows });
});

// DELETE /campaigns/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  await query('DELETE FROM campaigns WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ message: 'Campaign deleted' });
});

export default router;
