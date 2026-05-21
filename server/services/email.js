import nodemailer from 'nodemailer';
import { query } from '../config/database.js';
import { decrypt } from '../utils/encryption.js';
import { replaceVariables, processHeaders, generateMessageId } from './template.js';
import { applyInboxShield } from './inboxShield.js';
import { applyContentRandomizer } from './randomizer.js';
import { applyCreativeEngine, rotateSenderName, rotateReplyTo } from './creative.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';
import crypto from 'crypto';

// Transporter cache for connection pooling
const transporterCache = new Map();

/**
 * Get or create a Nodemailer transporter for an SMTP server.
 */
export function getTransporter(smtpConfig) {
  const key = `${smtpConfig.host}:${smtpConfig.port}:${smtpConfig.username}`;
  if (transporterCache.has(key)) return transporterCache.get(key);

  const password = smtpConfig.password_encrypted
    ? decrypt(smtpConfig.password_encrypted)
    : smtpConfig.password || '';

  const opts = {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.encryption === 'SSL',
    pool: true,
    maxConnections: 10,
    maxMessages: 500,
    rateDelta: 1000,
    rateLimit: 50,
  };

  if (smtpConfig.encryption === 'TLS') {
    opts.requireTLS = true;
  }

  if (smtpConfig.username) {
    opts.auth = { user: smtpConfig.username, pass: password };
  }

  // Skip TLS verification in dev
  if (env.NODE_ENV !== 'production') {
    opts.tls = { rejectUnauthorized: false };
  }

  const transporter = nodemailer.createTransport(opts);
  transporterCache.set(key, transporter);
  return transporter;
}

/**
 * Test an SMTP connection. Returns { success, latency, error }.
 */
export async function testSmtpConnection(smtpConfig) {
  const start = Date.now();
  try {
    const transporter = getTransporter(smtpConfig);
    await transporter.verify();
    return { success: true, latency: Date.now() - start };
  } catch (err) {
    return { success: false, latency: Date.now() - start, error: err.message };
  }
}

/**
 * Pick SMTP server from pool using round-robin with weights.
 */
export async function pickSmtpFromPool(poolName, userId) {
  const { rows } = await query(
    `SELECT * FROM smtp_servers 
     WHERE pool_name = $1 AND user_id = $2 AND is_enabled = TRUE 
       AND status != 'disabled' AND sent_today < daily_limit
     ORDER BY (sent_today::float / GREATEST(daily_limit, 1)) ASC, weight DESC
     LIMIT 1`,
    [poolName, userId]
  );
  return rows[0] || null;
}

/**
 * Build and send a single email with all transforms applied.
 * 
 * @param {Object} campaign - Campaign record from DB
 * @param {Object} recipient - Recipient record
 * @param {Object} smtpConfig - SMTP server config
 * @returns {{ success: boolean, messageId: string, error: string }}
 */
export async function buildAndSendEmail(campaign, recipient, smtpConfig) {
  const recipientHash = crypto.createHash('md5').update(recipient.email).digest('hex');
  const fromDomain = campaign.from_email.split('@')[1] || 'moonmailer.pro';
  const campaignData = {
    redirect_url: campaign.redirect_url || '',
    logo_url: campaign.logo_url || '',
  };

  try {
    // 1. Template variable replacement
    let subject = replaceVariables(campaign.subject, recipient, campaignData);
    let html = replaceVariables(campaign.html_body, recipient, campaignData);
    let customHeaders = campaign.custom_headers
      ? processHeaders(campaign.custom_headers, recipient, campaignData)
      : '';

    // Parse custom headers into object
    let extraHeaders = {};
    if (customHeaders) {
      for (const line of customHeaders.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.substring(0, colonIdx).trim();
          const val = line.substring(colonIdx + 1).trim();
          if (key && val) extraHeaders[key] = val;
        }
      }
    }

    // 2. Inbox Shield pipeline
    const shieldSettings = campaign.inbox_shield || {};
    const shieldResult = await applyInboxShield(
      { html, text: null, headers: extraHeaders, subject },
      shieldSettings,
      { campaignId: campaign.id, recipientHash, trackingDomain: env.TRACKING_DOMAIN, fromDomain }
    );
    html = shieldResult.html;
    subject = shieldResult.subject;
    extraHeaders = shieldResult.headers;
    const text = shieldResult.text;

    // 3. Content Randomizer
    const randSettings = campaign.content_randomizer || {};
    html = applyContentRandomizer(html, randSettings);

    // 4. Creative Engine
    const creativeSettings = campaign.creative_engine || {};
    const creativeResult = applyCreativeEngine(html, extraHeaders, creativeSettings);
    html = creativeResult.html;
    extraHeaders = creativeResult.headers;

    // Sender name / reply-to rotation
    let fromName = campaign.from_name;
    let replyTo = campaign.reply_to;
    if (creativeSettings.nameRotation && creativeSettings.senderNames) {
      const names = creativeSettings.senderNames.split('\n').filter(Boolean);
      const rotated = rotateSenderName(names);
      if (rotated) fromName = rotated;
    }
    if (creativeSettings.replyToRotation && creativeSettings.replyToEmails) {
      const emails = creativeSettings.replyToEmails.split('\n').filter(Boolean);
      const rotated = rotateReplyTo(emails);
      if (rotated) replyTo = rotated;
    }

    // 5. Build final message
    const messageId = generateMessageId(fromDomain);
    const transporter = getTransporter(smtpConfig);

    const mailOptions = {
      from: fromName ? `"${fromName}" <${campaign.from_email}>` : campaign.from_email,
      to: recipient.email,
      subject,
      html,
      messageId: messageId.replace(/[<>]/g, ''),
      headers: extraHeaders,
    };

    if (text) mailOptions.text = text;
    if (replyTo) mailOptions.replyTo = replyTo;

    // Handle content transfer encoding
    if (shieldResult.contentTransferEncoding === 'base64') {
      mailOptions.encoding = 'base64';
    } else if (shieldResult.contentTransferEncoding === 'quoted-printable') {
      mailOptions.textEncoding = 'quoted-printable';
    }

    // 6. Send
    const info = await transporter.sendMail(mailOptions);

    // 7. Update SMTP server sent counter
    await query('UPDATE smtp_servers SET sent_today = sent_today + 1 WHERE id = $1', [smtpConfig.id]);

    return {
      success: true,
      messageId: info.messageId || messageId,
      response: info.response,
    };
  } catch (err) {
    logger.error(`Send failed for ${recipient.email}:`, err.message);
    return {
      success: false,
      messageId: null,
      error: err.message,
    };
  }
}

/**
 * Close all cached transporters.
 */
export function closeAllTransporters() {
  for (const [key, transporter] of transporterCache) {
    transporter.close();
  }
  transporterCache.clear();
}
