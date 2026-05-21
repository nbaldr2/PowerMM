import { Router } from 'express';
import net from 'net';
import { authenticate } from '../middleware/auth.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * Send raw email content to SpamAssassin daemon via spamc protocol.
 */
async function checkWithSpamd(emailContent) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(
      { host: env.SPAMASSASSIN_HOST, port: env.SPAMASSASSIN_PORT },
      () => {
        const request = `REPORT SPAMC/1.5\r\nContent-length: ${Buffer.byteLength(emailContent)}\r\n\r\n${emailContent}`;
        client.write(request);
      }
    );

    let data = '';
    client.on('data', (chunk) => { data += chunk.toString(); });
    client.on('end', () => resolve(data));
    client.on('error', (err) => reject(err));
    client.setTimeout(30000, () => { client.destroy(); reject(new Error('SpamAssassin timeout')); });
  });
}

function parseSpamAssassinResult(response) {
  const lines = response.split('\n');
  let score = 0, threshold = 5.0;
  const rules = [];

  // Parse score
  const scoreLine = lines.find(l => l.includes('score=') || l.match(/^\s*[\d.-]+\/[\d.]+/));
  if (scoreLine) {
    const match = scoreLine.match(/([\d.-]+)\/([\d.]+)/);
    if (match) { score = parseFloat(match[1]); threshold = parseFloat(match[2]); }
  }

  // Parse rules
  for (const line of lines) {
    const ruleMatch = line.match(/^\s*([\d.-]+)\s+(\w+)\s+(.*)/);
    if (ruleMatch) {
      const [, ruleScore, ruleName, description] = ruleMatch;
      if (ruleName && ruleName !== 'pts' && ruleName !== 'rule') {
        rules.push({
          name: ruleName,
          score: parseFloat(ruleScore),
          description: description.trim(),
        });
      }
    }
  }

  return {
    score,
    threshold,
    isSpam: score >= threshold,
    level: score < 3 ? 'good' : score < 5 ? 'warning' : 'danger',
    rules: rules.sort((a, b) => b.score - a.score),
  };
}

// POST /spamcheck/spamassassin — check email with SpamAssassin
router.post('/spamassassin', authenticate, async (req, res) => {
  const { subject, fromEmail, fromName, htmlBody, textBody, headers } = req.body;

  // Build a raw MIME message for SpamAssassin
  const boundary = `----=_MimeMessage_${Date.now()}`;
  let rawEmail = `From: ${fromName ? `"${fromName}" <${fromEmail}>` : fromEmail}\r\n`;
  rawEmail += `To: test@example.com\r\n`;
  rawEmail += `Subject: ${subject}\r\n`;
  rawEmail += `Date: ${new Date().toUTCString()}\r\n`;
  rawEmail += `MIME-Version: 1.0\r\n`;

  if (headers) rawEmail += headers + '\r\n';

  if (htmlBody && textBody) {
    rawEmail += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    rawEmail += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${textBody}\r\n`;
    rawEmail += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlBody}\r\n`;
    rawEmail += `--${boundary}--`;
  } else {
    rawEmail += `Content-Type: text/html; charset="UTF-8"\r\n\r\n${htmlBody || textBody || ''}`;
  }

  try {
    const response = await checkWithSpamd(rawEmail);
    const result = parseSpamAssassinResult(response);

    // Add tips for failing rules
    result.tips = result.rules
      .filter(r => r.score > 0)
      .map(r => {
        if (r.name.includes('HTML')) return `HTML issue: ${r.description}. Consider cleaning up your HTML.`;
        if (r.name.includes('URI') || r.name.includes('URL')) return `Link issue: ${r.description}. Check your URLs.`;
        if (r.name.includes('SUBJ')) return `Subject issue: ${r.description}. Modify your subject line.`;
        return `${r.name}: ${r.description}`;
      })
      .slice(0, 5);

    res.json(result);
  } catch (err) {
    // Fallback: basic local spam scoring
    logger.warn('SpamAssassin unavailable, using basic local scorer:', err.message);

    let score = 0;
    const rules = [];
    const content = (subject + ' ' + (htmlBody || '') + ' ' + (textBody || '')).toLowerCase();

    // Basic local checks
    const spamWords = [
      { word: 'free', points: 0.5 }, { word: 'winner', points: 1.5 },
      { word: 'click here', points: 1.0 }, { word: 'act now', points: 1.5 },
      { word: 'limited time', points: 1.0 }, { word: 'urgent', points: 1.0 },
      { word: 'earn money', points: 2.0 }, { word: 'no obligation', points: 1.5 },
      { word: 'credit card', points: 1.0 }, { word: 'guarantee', points: 0.5 },
    ];

    for (const { word, points } of spamWords) {
      if (content.includes(word)) {
        score += points;
        rules.push({ name: `LOCAL_SPAM_${word.replace(/\s/g, '_').toUpperCase()}`, score: points, description: `Contains spam trigger: "${word}"` });
      }
    }

    // Check image-to-text ratio
    const imgCount = (htmlBody || '').match(/<img/gi)?.length || 0;
    const textLength = (textBody || htmlBody || '').replace(/<[^>]*>/g, '').length;
    if (imgCount > 3 && textLength < 200) {
      score += 2.0;
      rules.push({ name: 'HIGH_IMG_RATIO', score: 2.0, description: 'High image-to-text ratio' });
    }

    // Check for all caps subject
    if (subject && subject === subject.toUpperCase() && subject.length > 5) {
      score += 1.5;
      rules.push({ name: 'SUBJ_ALL_CAPS', score: 1.5, description: 'Subject line is all capital letters' });
    }

    res.json({
      score: Math.round(score * 10) / 10,
      threshold: 5.0,
      isSpam: score >= 5,
      level: score < 3 ? 'good' : score < 5 ? 'warning' : 'danger',
      rules,
      tips: rules.map(r => `${r.name}: ${r.description}`).slice(0, 5),
      fallback: true,
    });
  }
});

// POST /spamcheck/cloudmark — simplified Cloudmark check
router.post('/cloudmark', authenticate, async (req, res) => {
  // Cloudmark CSI would require API access. Provide a simulated result.
  const { htmlBody, subject } = req.body;
  const content = (subject + ' ' + (htmlBody || '')).toLowerCase();

  let score = 0;
  if (content.includes('unsubscribe')) score -= 10;
  if (!content.includes('unsubscribe')) score += 20;
  if (content.match(/<img/gi)?.length > 5) score += 15;
  if (content.length < 100) score += 10;

  const confidence = Math.min(100, Math.max(0, 50 + score));
  const verdict = confidence > 70 ? 'Spam' : confidence > 40 ? 'Suspect' : 'Clean';

  res.json({
    verdict,
    confidence,
    category: verdict === 'Clean' ? 'Legitimate' : 'Marketing/Bulk',
    note: 'Connect Cloudmark CSI API key for production accuracy',
  });
});

export default router;
