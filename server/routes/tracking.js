import { Router } from 'express';
import { query } from '../config/database.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const router = Router();

// 1x1 transparent GIF pixel
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// GET /track/open/:campaignId/:recipientHash — open tracking pixel
router.get('/open/:campaignId/:recipientHash', async (req, res) => {
  const { campaignId, recipientHash } = req.params;
  try {
    // Find the send_log entry
    const { rows } = await query(
      `SELECT sl.id FROM send_log sl WHERE sl.campaign_id = $1 
       AND md5(sl.email) = $2 LIMIT 1`,
      [campaignId, recipientHash]
    );

    if (rows.length > 0) {
      const sendLogId = rows[0].id;
      // Check for unique open (first time only)
      const { rows: existing } = await query(
        `SELECT id FROM tracking_events WHERE send_log_id = $1 AND event_type = 'open' LIMIT 1`,
        [sendLogId]
      );

      const isUnique = existing.length === 0;

      // Record event
      await query(
        `INSERT INTO tracking_events (campaign_id, send_log_id, recipient_email, event_type, user_agent, ip_address)
         VALUES ($1, $2, (SELECT email FROM send_log WHERE id = $2), 'open', $3, $4)`,
        [campaignId, sendLogId, req.headers['user-agent'] || '', req.ip]
      );

      // Increment counters
      await query('UPDATE send_log SET open_count = open_count + 1 WHERE id = $1', [sendLogId]);
      if (isUnique) {
        await query('UPDATE campaigns SET open_count = open_count + 1 WHERE id = $1', [campaignId]);
      }
    }
  } catch (err) {
    logger.error('Open tracking error:', err.message);
  }

  // Always return the pixel
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' });
  res.send(PIXEL);
});

// GET /track/click/:campaignId/:recipientHash/:linkIndex — click tracking
router.get('/click/:campaignId/:recipientHash/:linkIndex', async (req, res) => {
  const { campaignId, recipientHash, linkIndex } = req.params;
  const originalUrl = req.query.url;

  if (!originalUrl) return res.status(400).send('Missing URL');

  try {
    const { rows } = await query(
      `SELECT sl.id FROM send_log sl WHERE sl.campaign_id = $1 AND md5(sl.email) = $2 LIMIT 1`,
      [campaignId, recipientHash]
    );

    if (rows.length > 0) {
      const sendLogId = rows[0].id;
      await query(
        `INSERT INTO tracking_events (campaign_id, send_log_id, recipient_email, event_type, url, user_agent, ip_address)
         VALUES ($1, $2, (SELECT email FROM send_log WHERE id = $2), 'click', $3, $4, $5)`,
        [campaignId, sendLogId, originalUrl, req.headers['user-agent'] || '', req.ip]
      );
      await query('UPDATE send_log SET click_count = click_count + 1 WHERE id = $1', [sendLogId]);
      await query('UPDATE campaigns SET click_count = click_count + 1 WHERE id = $1', [campaignId]);
    }
  } catch (err) {
    logger.error('Click tracking error:', err.message);
  }

  res.redirect(302, decodeURIComponent(originalUrl));
});

// GET /unsubscribe/:campaignId/:recipientHash — one-click unsubscribe
router.get('/unsubscribe/:campaignId/:recipientHash', async (req, res) => {
  const { campaignId, recipientHash } = req.params;

  try {
    const { rows } = await query(
      `SELECT sl.email, c.user_id FROM send_log sl 
       JOIN campaigns c ON sl.campaign_id = c.id
       WHERE sl.campaign_id = $1 AND md5(sl.email) = $2 LIMIT 1`,
      [campaignId, recipientHash]
    );

    if (rows.length > 0) {
      const { email, user_id } = rows[0];

      // Add to suppression list
      await query(
        `INSERT INTO suppression_list (user_id, email, reason, source_campaign_id)
         VALUES ($1, $2, 'unsubscribe', $3) ON CONFLICT (user_id, email) DO NOTHING`,
        [user_id, email, campaignId]
      );

      // Record event
      await query(
        `INSERT INTO tracking_events (campaign_id, recipient_email, event_type, ip_address)
         VALUES ($1, $2, 'unsubscribe', $3)`,
        [campaignId, email, req.ip]
      );

      await query('UPDATE campaigns SET unsubscribe_count = unsubscribe_count + 1 WHERE id = $1', [campaignId]);
    }
  } catch (err) {
    logger.error('Unsubscribe error:', err.message);
  }

  // Return branded unsubscribe page
  res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title>
  <style>body{font-family:Inter,sans-serif;background:#111520;color:#94a3b8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
  .card{background:#1a1f2e;border:1px solid #2e374d;border-radius:16px;padding:48px;text-align:center;max-width:420px;}
  h1{color:#10b981;font-size:24px;margin-bottom:16px;} p{line-height:1.6;}</style></head>
  <body><div class="card"><h1>✅ Unsubscribed Successfully</h1>
  <p>You have been removed from our mailing list and will no longer receive emails from this sender.</p>
  <p style="color:#64748b;font-size:14px;margin-top:24px;">This action cannot be undone from this page.</p></div></body></html>`);
});

// POST /unsubscribe/:campaignId/:recipientHash — RFC 8058 List-Unsubscribe-Post
router.post('/unsubscribe/:campaignId/:recipientHash', async (req, res) => {
  // Same logic as GET but returns 200 OK for one-click
  const { campaignId, recipientHash } = req.params;
  try {
    const { rows } = await query(
      `SELECT sl.email, c.user_id FROM send_log sl JOIN campaigns c ON sl.campaign_id = c.id
       WHERE sl.campaign_id = $1 AND md5(sl.email) = $2 LIMIT 1`,
      [campaignId, recipientHash]
    );
    if (rows.length > 0) {
      await query(
        `INSERT INTO suppression_list (user_id, email, reason, source_campaign_id) VALUES ($1, $2, 'unsubscribe', $3) ON CONFLICT DO NOTHING`,
        [rows[0].user_id, rows[0].email, campaignId]
      );
    }
  } catch (err) { logger.error('Unsubscribe POST error:', err.message); }
  res.status(200).send('OK');
});

export default router;
