import { Worker } from 'bullmq';
import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { buildAndSendEmail, pickSmtpFromPool, closeAllTransporters } from '../services/email.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://powermm:powermm_secret@localhost:5432/powermm' });
const q = (text, params) => pool.query(text, params);

// Speed mode configs
const SPEED_CONFIGS = {
  Normal: { batchDelay: 100, emailDelay: 10, concurrency: 2 },
  Turbo: { batchDelay: 0, emailDelay: 0, concurrency: 5 },
  Ludicrous: { batchDelay: 0, emailDelay: 0, concurrency: 10 },
};

/**
 * Emit a Socket.io event via Redis pub/sub.
 */
function emitEvent(eventName, data) {
  redis.publish('campaign:events', JSON.stringify({ event: eventName, data }));
}

/**
 * Process a campaign send job.
 */
async function processCampaignSend(job) {
  const { campaignId, userId, batchSize = 1000, speedMode = 'Normal',
    resumeFromOffset = 0, campaign: campaignData } = job.data;

  logger.info(`Worker: Starting campaign ${campaignId} (speed: ${speedMode})`);
  const speed = SPEED_CONFIGS[speedMode] || SPEED_CONFIGS.Normal;

  // Fetch campaign from DB if not provided in job data (fallback)
  let campaign = campaignData;
  if (!campaign) {
    const { rows: campaignRows } = await q('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
    if (campaignRows.length === 0) throw new Error('Campaign not found');
    campaign = campaignRows[0];
  }

  // Get suppression list
  const { rows: suppressions } = await q('SELECT email FROM suppression_list WHERE user_id = $1', [userId]);
  const suppressedSet = new Set(suppressions.map(s => s.email.toLowerCase()));

  // Fetch total recipients
  const { rows: countRows } = await q(
    "SELECT COUNT(*) as c FROM recipients WHERE list_id = $1 AND status = 'active'",
    [campaign.list_id]
  );
  const totalRecipients = parseInt(countRows[0].c);
  let offset = resumeFromOffset;
  let totalSent = campaign.sent_count || 0;
  let totalFailed = campaign.failed_count || 0;
  const startTime = Date.now();

  emitEvent('send:start', { campaignId, total: totalRecipients });

  // Handle seed test (warmup) - send to seed addresses first
  const seedSettings = campaign.seed_settings || {};
  if (seedSettings.send_seed_test && seedSettings.seed_addresses && seedSettings.seed_addresses.length > 0) {
    logger.info(`Campaign ${campaignId}: Sending seed test to ${seedSettings.seed_addresses.length} addresses`);
    emitEvent('send:progress', { campaignId, sent: 0, failed: 0, total: totalRecipients, percent: 0, rate: 0, eta: 0, batchNum: 0, message: 'Sending seed test...' });
    
    for (const seedEmail of seedSettings.seed_addresses) {
      try {
        const seedRecipient = { email: seedEmail, email_user: seedEmail.split('@')[0], email_domain: seedEmail.split('@')[1] };
        const smtp = campaign.smtp_server_id 
          ? (await q('SELECT * FROM smtp_servers WHERE id = $1', [campaign.smtp_server_id])).rows[0]
          : await pickSmtpFromPool(campaign.pool_name || 'default', userId);
        
        if (smtp) {
          await buildAndSendEmail(campaign, seedRecipient, smtp);
          await q(`INSERT INTO send_log (campaign_id, recipient_id, email, status) VALUES ($1,$2,$3,'seed_sent')`,
            [campaignId, null, seedEmail]);
        }
      } catch (err) {
        logger.warn(`Seed test failed for ${seedEmail}: ${err.message}`);
      }
      // Delay between seed sends
      if (seedSettings.seed_delay_seconds > 0) {
        await new Promise(r => setTimeout(r, seedSettings.seed_delay_seconds * 1000));
      }
    }
    emitEvent('send:progress', { campaignId, sent: 0, failed: 0, total: totalRecipients, percent: 0, rate: 0, eta: 0, batchNum: 0, message: 'Seed test complete. Starting main send...' });
  }

  // Process in batches
  while (offset < totalRecipients) {
    // Check if campaign was paused/cancelled
    const { rows: statusCheck } = await q('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
    if (!statusCheck.length || statusCheck[0].status === 'paused' || statusCheck[0].status === 'cancelled') {
      logger.info(`Campaign ${campaignId} was ${statusCheck[0]?.status || 'stopped'}`);
      break;
    }

    // Fetch batch of recipients
    const { rows: recipients } = await q(
      `SELECT * FROM recipients WHERE list_id = $1 AND status = 'active' 
       ORDER BY id LIMIT $2 OFFSET $3`,
      [campaign.list_id, batchSize, offset]
    );

    if (recipients.length === 0) break;

    let batchSent = 0, batchFailed = 0;

    for (const recipient of recipients) {
      // Skip suppressed
      if (suppressedSet.has(recipient.email.toLowerCase())) {
        await q(
          `INSERT INTO send_log (campaign_id, recipient_id, email, status, error_msg) VALUES ($1,$2,$3,'skipped','Suppressed')`,
          [campaignId, recipient.id, recipient.email]
        );
        continue;
      }

      // Get SMTP server (round-robin from pool)
      let smtp;
      if (campaign.smtp_server_id) {
        const { rows: sr } = await q('SELECT * FROM smtp_servers WHERE id = $1', [campaign.smtp_server_id]);
        smtp = sr[0];
      } else {
        smtp = await pickSmtpFromPool(campaign.pool_name || 'default', userId);
      }

      if (!smtp) {
        logger.error('No SMTP server available');
        await q(
          `INSERT INTO send_log (campaign_id, recipient_id, email, status, error_msg) VALUES ($1,$2,$3,'failed','No SMTP server')`,
          [campaignId, recipient.id, recipient.email]
        );
        totalFailed++;
        batchFailed++;
        continue;
      }

      // Send the email
      const result = await buildAndSendEmail(campaign, recipient, smtp);

      // Log result
      await q(
        `INSERT INTO send_log (campaign_id, recipient_id, email, status, smtp_server_id, message_id, error_msg)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [campaignId, recipient.id, recipient.email,
         result.success ? 'sent' : 'failed', smtp.id,
         result.messageId, result.error || null]
      );

      if (result.success) {
        totalSent++;
        batchSent++;
      } else {
        totalFailed++;
        batchFailed++;

        // Handle bounces
        if (result.error && (result.error.includes('550') || result.error.includes('553') || result.error.includes('5.1.'))) {
          await q(
            `INSERT INTO suppression_list (user_id, email, reason, source_campaign_id) VALUES ($1,$2,'bounce',$3) ON CONFLICT DO NOTHING`,
            [userId, recipient.email, campaignId]
          );
          suppressedSet.add(recipient.email.toLowerCase());
        }
      }

      // Email delay
      if (speed.emailDelay > 0) {
        await new Promise(r => setTimeout(r, speed.emailDelay));
      }
    }

    offset += recipients.length;

    // Update campaign progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? (totalSent / elapsed).toFixed(1) : 0;
    const percent = ((offset / totalRecipients) * 100).toFixed(1);
    const eta = rate > 0 ? Math.ceil((totalRecipients - offset) / rate) : 0;

    await q(
      `UPDATE campaigns SET sent_count = $1, failed_count = $2, last_processed_offset = $3, 
       send_rate = $4, duration_seconds = $5 WHERE id = $6`,
      [totalSent, totalFailed, offset, rate, Math.ceil(elapsed), campaignId]
    );

    // Emit progress
    emitEvent('send:progress', {
      campaignId, sent: totalSent, failed: totalFailed, total: totalRecipients,
      percent, rate, eta, batchNum: Math.ceil(offset / batchSize),
    });

    emitEvent('send:batch_complete', {
      campaignId, batchNum: Math.ceil(offset / batchSize), batchSent, batchFailed,
    });

    // Batch delay
    if (speed.batchDelay > 0) {
      await new Promise(r => setTimeout(r, speed.batchDelay));
    }

    // GC hint for large sends
    if (offset % (batchSize * 10) === 0 && global.gc) {
      global.gc();
    }
  }

  // Complete
  const duration = Math.ceil((Date.now() - startTime) / 1000);
  const finalStatus = totalFailed === totalRecipients ? 'failed' : 'completed';

  await q(
    `UPDATE campaigns SET status = $1, completed_at = NOW(), sent_count = $2, failed_count = $3, 
     delivered_count = $2, duration_seconds = $4 WHERE id = $5 AND status = 'sending'`,
    [finalStatus, totalSent, totalFailed, duration, campaignId]
  );

  // Update user quota
  await q('UPDATE users SET quota_used_today = quota_used_today + $1 WHERE id = $2', [totalSent, userId]);

  emitEvent('send:complete', { campaignId, totalSent, totalFailed, duration });
  logger.info(`Campaign ${campaignId} completed: ${totalSent} sent, ${totalFailed} failed in ${duration}s`);
}

// Create BullMQ worker
const worker = new Worker('email-send', processCampaignSend, {
  connection: redis,
  concurrency: 1,
  limiter: { max: 3, duration: 1000 },
});

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed for campaign ${job.data.campaignId}`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err.message);
  if (job?.data?.campaignId) {
    q("UPDATE campaigns SET status = 'failed' WHERE id = $1", [job.data.campaignId]).catch(() => {});
    emitEvent('send:error', { campaignId: job.data.campaignId, error: err.message });
  }
});

worker.on('error', (err) => {
  logger.error('Worker error:', err);
});

logger.info('📬 BullMQ Send Worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Worker shutting down...');
  await worker.close();
  closeAllTransporters();
  process.exit(0);
});
