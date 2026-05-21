import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /analytics/dashboard — global stats
router.get('/dashboard', authenticate, async (req, res) => {
  const uid = req.user.id;

  const [totalSent, todaySent, weekSent, avgOpen, avgBounce, activeSMTP, recentCampaigns] = await Promise.all([
    query(`SELECT COUNT(*) as c FROM send_log sl JOIN campaigns c ON sl.campaign_id = c.id WHERE c.user_id = $1`, [uid]),
    query(`SELECT COUNT(*) as c FROM send_log sl JOIN campaigns c ON sl.campaign_id = c.id WHERE c.user_id = $1 AND sl.sent_at > NOW() - INTERVAL '1 day'`, [uid]),
    query(`SELECT COUNT(*) as c FROM send_log sl JOIN campaigns c ON sl.campaign_id = c.id WHERE c.user_id = $1 AND sl.sent_at > NOW() - INTERVAL '7 days'`, [uid]),
    query(`SELECT AVG(CASE WHEN sent_count > 0 THEN (open_count::float / sent_count) * 100 ELSE 0 END) as rate FROM campaigns WHERE user_id = $1 AND status = 'completed'`, [uid]),
    query(`SELECT AVG(CASE WHEN sent_count > 0 THEN (bounce_count::float / sent_count) * 100 ELSE 0 END) as rate FROM campaigns WHERE user_id = $1 AND status = 'completed'`, [uid]),
    query(`SELECT COUNT(*) as c FROM smtp_servers WHERE user_id = $1 AND is_enabled = TRUE AND status = 'connected'`, [uid]),
    query(`SELECT id, name, status, sent_count, open_count, click_count, created_at FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [uid]),
  ]);

  res.json({
    totalSent: parseInt(totalSent.rows[0]?.c || 0),
    todaySent: parseInt(todaySent.rows[0]?.c || 0),
    weekSent: parseInt(weekSent.rows[0]?.c || 0),
    avgOpenRate: parseFloat(avgOpen.rows[0]?.rate || 0).toFixed(1),
    avgBounceRate: parseFloat(avgBounce.rows[0]?.rate || 0).toFixed(1),
    activeSmtpServers: parseInt(activeSMTP.rows[0]?.c || 0),
    recentCampaigns: recentCampaigns.rows,
  });
});

// GET /analytics/campaign/:id — detailed campaign analytics
router.get('/campaign/:id', authenticate, async (req, res) => {
  const cid = req.params.id;

  const [campaign, statusBreakdown, opensOverTime, topLinks, topClients] = await Promise.all([
    query('SELECT * FROM campaigns WHERE id = $1 AND user_id = $2', [cid, req.user.id]),
    query(`SELECT status, COUNT(*) as count FROM send_log WHERE campaign_id = $1 GROUP BY status`, [cid]),
    query(`SELECT date_trunc('hour', created_at) as hour, COUNT(*) as count FROM tracking_events WHERE campaign_id = $1 AND event_type = 'open' GROUP BY hour ORDER BY hour`, [cid]),
    query(`SELECT url, COUNT(*) as clicks FROM tracking_events WHERE campaign_id = $1 AND event_type = 'click' GROUP BY url ORDER BY clicks DESC LIMIT 10`, [cid]),
    query(`SELECT CASE WHEN user_agent ILIKE '%thunderbird%' THEN 'Thunderbird' WHEN user_agent ILIKE '%outlook%' THEN 'Outlook' WHEN user_agent ILIKE '%gmail%' THEN 'Gmail' WHEN user_agent ILIKE '%apple%' THEN 'Apple Mail' WHEN user_agent ILIKE '%yahoo%' THEN 'Yahoo Mail' ELSE 'Other' END as client, COUNT(*) as count FROM tracking_events WHERE campaign_id = $1 AND event_type = 'open' GROUP BY client ORDER BY count DESC`, [cid]),
  ]);

  if (campaign.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });

  const c = campaign.rows[0];
  const totalSent = c.sent_count || 1;

  res.json({
    campaign: c,
    stats: {
      sent: c.sent_count, delivered: c.delivered_count, failed: c.failed_count,
      openRate: ((c.open_count / totalSent) * 100).toFixed(1),
      clickRate: ((c.click_count / totalSent) * 100).toFixed(1),
      bounceRate: ((c.bounce_count / totalSent) * 100).toFixed(1),
      unsubscribeRate: ((c.unsubscribe_count / totalSent) * 100).toFixed(1),
      duration: c.duration_seconds, sendRate: c.send_rate,
    },
    statusBreakdown: statusBreakdown.rows,
    opensOverTime: opensOverTime.rows,
    topLinks: topLinks.rows,
    topClients: topClients.rows,
  });
});

// GET /analytics/campaign/:id/export — export send log to CSV
router.get('/campaign/:id/export', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT sl.email, sl.status, sl.error_msg, sl.open_count, sl.click_count, sl.bounce_type, sl.sent_at
     FROM send_log sl WHERE sl.campaign_id = $1 ORDER BY sl.sent_at`,
    [req.params.id]
  );

  const csv = ['email,status,error,opens,clicks,bounce_type,sent_at'];
  for (const r of rows) {
    csv.push(`${r.email},${r.status},"${r.error_msg || ''}",${r.open_count},${r.click_count},${r.bounce_type || ''},${r.sent_at}`);
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}-report.csv"`);
  res.send(csv.join('\n'));
});

export default router;
