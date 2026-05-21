import crypto from 'crypto';

/**
 * Creative Engine Pipeline
 * Generates unique content variations per email to defeat content-based filtering.
 */

// Simple synonym map for common words
const SYNONYMS = {
  'important': ['crucial', 'essential', 'critical', 'vital', 'significant'],
  'please': ['kindly', 'we ask that you', 'we request you'],
  'immediately': ['right away', 'without delay', 'at once', 'promptly'],
  'update': ['refresh', 'renew', 'modify', 'revise'],
  'confirm': ['verify', 'validate', 'acknowledge', 'affirm'],
  'account': ['subscription', 'profile', 'membership', 'service'],
  'click': ['tap', 'select', 'press', 'follow'],
  'required': ['necessary', 'needed', 'mandatory', 'obligatory'],
  'information': ['details', 'data', 'particulars', 'specifics'],
  'contact': ['reach out to', 'get in touch with', 'communicate with'],
  'help': ['assist', 'support', 'aid'],
  'receive': ['get', 'obtain', 'acquire'],
  'notice': ['notification', 'alert', 'advisory', 'bulletin'],
  'action': ['step', 'measure', 'response'],
  'service': ['platform', 'system', 'solution'],
};

// Unique sentence templates for injection
const UNIQUE_SENTENCES = [
  'This communication was generated on {date} for reference {ref}.',
  'Your unique session identifier for this message is {ref}.',
  'Message integrity verified at {date} — ref: {ref}.',
  'Delivery confirmation token: {ref}. Processed {date}.',
  'Content ID: {ref} | Generated: {date} | Status: Verified.',
];

// ============================================================
// CONTENT
// ============================================================
export function addUniqueHash(html) {
  const hash = crypto.randomBytes(16).toString('hex');
  return html + `\n<!-- uid:${hash} -->`;
}

export function applySynonyms(html) {
  let result = html;
  for (const [word, alternatives] of Object.entries(SYNONYMS)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      if (Math.random() < 0.4) {
        const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
        // Preserve original casing
        if (match[0] === match[0].toUpperCase()) {
          return alt.charAt(0).toUpperCase() + alt.slice(1);
        }
        return alt;
      }
      return match;
    });
  }
  return result;
}

export function shuffleParagraphs(html) {
  // Shuffle blocks marked with <!--SHUFFLE--> ... <!--/SHUFFLE-->
  const regex = /<!--SHUFFLE-->([\s\S]*?)<!--\/SHUFFLE-->/g;
  const blocks = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  if (blocks.length < 2) return html;

  // Fisher-Yates shuffle
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }

  let idx = 0;
  return html.replace(regex, () => {
    return `<!--SHUFFLE-->${blocks[idx++]}<!--/SHUFFLE-->`;
  });
}

export function addLengthPadding(html) {
  const paddingLength = Math.floor(Math.random() * 200) + 50;
  const chars = 'abcdefghijklmnopqrstuvwxyz ';
  let padding = '';
  for (let i = 0; i < paddingLength; i++) {
    padding += chars[Math.floor(Math.random() * chars.length)];
  }
  const div = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:0;">${padding}</div>`;
  return html.replace(/<\/body>/i, `${div}</body>`);
}

export function addDataAttributes(html) {
  const attrs = [
    `data-v="${crypto.randomBytes(4).toString('hex')}"`,
    `data-ts="${Date.now()}"`,
    `data-src="mm-${crypto.randomBytes(2).toString('hex')}"`,
  ];
  return html.replace(/<body/i, `<body ${attrs.join(' ')}`);
}

export function wsDiversity(html) {
  const spaces = [' ', '\u00A0', '\u2002', '\u2003', '\u2009'];
  return html.replace(/>([^<]+)</g, (match, text) => {
    let result = '';
    for (const char of text) {
      if (char === ' ' && Math.random() < 0.1) {
        result += spaces[Math.floor(Math.random() * spaces.length)];
      } else {
        result += char;
      }
    }
    return `>${result}<`;
  });
}

// ============================================================
// ANTI-FILTER
// ============================================================
export function addConversationSeed(html) {
  const thread = `<div style="display:none;max-height:0;overflow:hidden;">
--- Original Message ---
From: "Customer Support" <support@service.com>
Date: ${new Date(Date.now() - 86400000).toISOString()}
Subject: Re: Your inquiry

Thank you for reaching out. We've received your request and will process it shortly.
Best regards, Support Team
</div>`;
  return html.replace(/<body([^>]*)>/i, `<body$1>${thread}`);
}

export function colorJitter(html) {
  return html.replace(/#([0-9a-fA-F]{6})/g, (match, hex) => {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const jitter = () => Math.max(0, Math.min(255, Math.floor((Math.random() - 0.5) * 12)));
    const nr = Math.max(0, Math.min(255, r + jitter()));
    const ng = Math.max(0, Math.min(255, g + jitter()));
    const nb = Math.max(0, Math.min(255, b + jitter()));
    return '#' + [nr, ng, nb].map(c => c.toString(16).padStart(2, '0')).join('');
  });
}

export function spacingJitter(html) {
  return html.replace(/(padding|margin):\s*(\d+)px/gi, (match, prop, val) => {
    const jitter = Math.floor(Math.random() * 5) - 2;
    const newVal = Math.max(0, parseInt(val) + jitter);
    return `${prop}: ${newVal}px`;
  });
}

export function addUniqueSentence(html) {
  const template = UNIQUE_SENTENCES[Math.floor(Math.random() * UNIQUE_SENTENCES.length)];
  const sentence = template
    .replace('{date}', new Date().toISOString().split('T')[0])
    .replace('{ref}', crypto.randomBytes(6).toString('hex').toUpperCase());
  const div = `<div style="font-size:1px;line-height:1px;color:#f6f6f6;display:none;">${sentence}</div>`;
  return html.replace(/<\/body>/i, `${div}</body>`);
}

// ============================================================
// VISUAL
// ============================================================
export function addResponsive(html) {
  const meta = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  const styles = `<style>@media only screen and (max-width:600px){.email-container{width:100%!important;}.mobile-hide{display:none!important;}.mobile-full{width:100%!important;}}</style>`;
  html = html.replace(/<head([^>]*)>/i, `<head$1>${meta}${styles}`);
  return html;
}

export function imgSizeJitter(html) {
  return html.replace(/width="(\d+)"/gi, (match, w) => {
    const jitter = Math.floor(Math.random() * 5) - 2;
    return `width="${Math.max(1, parseInt(w) + jitter)}"`;
  });
}

export function gmailPrimaryHeaders(headers) {
  return {
    ...headers,
    'X-Google-DKIM': 'pass',
    'X-Gm-Message-State': crypto.randomBytes(32).toString('base64'),
    'Precedence': 'bulk',
    'X-Auto-Response-Suppress': 'OOF',
  };
}

// ============================================================
// HEADERS
// ============================================================
export function addFakeThread(headers) {
  const fakeId = `<${crypto.randomBytes(12).toString('hex')}@thread.local>`;
  return {
    ...headers,
    'In-Reply-To': fakeId,
    'References': `${fakeId} <${crypto.randomBytes(12).toString('hex')}@prev.local>`,
    'Thread-Topic': 'Re: Account Notification',
  };
}

export function rotateSenderName(senderNamesList) {
  if (!senderNamesList || senderNamesList.length === 0) return null;
  return senderNamesList[Math.floor(Math.random() * senderNamesList.length)];
}

export function rotateReplyTo(replyToList) {
  if (!replyToList || replyToList.length === 0) return null;
  return replyToList[Math.floor(Math.random() * replyToList.length)];
}

// ============================================================
// MAIN PIPELINE
// ============================================================
export function applyCreativeEngine(html, headers = {}, settings = {}) {
  if (!html) return { html, headers };

  // Content
  if (settings.uniqueHash) html = addUniqueHash(html);
  if (settings.synonyms) html = applySynonyms(html);
  if (settings.shuffleParagraphs) html = shuffleParagraphs(html);
  if (settings.lengthPadding) html = addLengthPadding(html);
  if (settings.dataAttributes) html = addDataAttributes(html);
  if (settings.wsDiversity) html = wsDiversity(html);

  // Anti-Filter
  if (settings.conversationSeed) html = addConversationSeed(html);
  if (settings.colorJitter) html = colorJitter(html);
  if (settings.spacingJitter) html = spacingJitter(html);
  if (settings.uniqueSentence) html = addUniqueSentence(html);

  // Visual
  if (settings.responsive) html = addResponsive(html);
  if (settings.imgSize) html = imgSizeJitter(html);
  if (settings.gmailPrimary) headers = gmailPrimaryHeaders(headers);

  // Headers
  if (settings.fakeThread) headers = addFakeThread(headers);

  // Sender/Reply-To rotation handled at campaign send level
  return { html, headers };
}
