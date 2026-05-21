import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * MoonMailer Pro Template Engine
 * Replaces all [-token-] variables and {option1|option2} syntax per recipient.
 */

// Curated emoji set for [-emoji-]
const EMOJI_SET = ['🚀', '⚡', '🔥', '💎', '🎯', '✨', '🌟', '💡', '🔔', '📢',
  '📧', '📬', '🏆', '💼', '🔒', '⏰', '🎁', '💰', '📊', '🛡️'];

/**
 * Generate random values for each token type.
 */
function generateRandomValues() {
  const hexChars = '0123456789abcdef';
  const alphaChars = 'abcdefghijklmnopqrstuvwxyz';
  const alphaNumChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  const randomString = (chars, len) => {
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  };

  const now = new Date();

  return {
    randomstring: randomString(alphaNumChars, 8),
    randomnumber: String(Math.floor(1000 + Math.random() * 9999999)),
    randomletters: randomString(alphaChars, 5),
    randomdS: randomString(alphaNumChars, 6),
    randomuuid: uuidv4(),
    randomhex: randomString(hexChars, 6),
    shortid: randomString(alphaNumChars, 6),
    randomcolor: '#' + randomString(hexChars, 6),
    randompid: String(Math.floor(1000 + Math.random() * 89000)),
    randomu: randomString(alphaNumChars, 12),
    randomclass: 'cls-' + randomString(alphaChars, 8),
    randomid: 'id-' + randomString(alphaNumChars, 10),
    randommessageid: uuidv4() + '@mail.' + randomString(alphaChars, 8) + '.com',
    randomboundary: '----=_Part_' + randomString(alphaNumChars, 16),
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),
    unixtime: String(Math.floor(now.getTime() / 1000)),
    year: String(now.getFullYear()),
    emoji: EMOJI_SET[Math.floor(Math.random() * EMOJI_SET.length)],
  };
}

/**
 * Process {option1|option2|option3} syntax — random pick per email.
 */
function processSpintax(text) {
  return text.replace(/\{([^{}]+)\}/g, (match, group) => {
    const options = group.split('|').map(o => o.trim());
    return options[Math.floor(Math.random() * options.length)];
  });
}

/**
 * Replace all template variables in text for a given recipient.
 * 
 * @param {string} text - Template text (subject, body, headers)
 * @param {Object} recipient - Recipient data { email, firstname, lastname, ... }
 * @param {Object} campaignData - Campaign settings { redirect_url, logo_url }
 * @returns {string} Processed text
 */
export function replaceVariables(text, recipient = {}, campaignData = {}) {
  if (!text) return '';

  const randoms = generateRandomValues();

  // Parse email parts
  const email = recipient.email || '';
  const emailParts = email.split('@');
  const emailUser = emailParts[0] || '';
  const emailDomain = emailParts[1] || '';

  // Build replacement map
  const vars = {
    // Recipient fields
    '[-email-]': email,
    '[-emailuser-]': emailUser,
    '[-emaildomain-]': emailDomain,
    '[-base64email-]': email ? Buffer.from(email).toString('base64') : '',
    '[-firstname-]': recipient.firstname || '',
    '[-lastname-]': recipient.lastname || '',
    '[-fullname-]': [recipient.firstname, recipient.lastname].filter(Boolean).join(' ') || '',
    '[-company-]': recipient.company || '',
    '[-jobtitle-]': recipient.jobtitle || '',
    '[-phone-]': recipient.phone || '',
    '[-address-]': recipient.address || '',
    '[-city-]': recipient.city || '',
    '[-country-]': recipient.country || '',
    '[-domain-]': recipient.domain || emailDomain,

    // Campaign URLs
    '[-url-]': campaignData.redirect_url || '',
    '[-url-img-]': campaignData.logo_url || '',

    // Random generators (unique per email)
    '[-randomstring-]': randoms.randomstring,
    '[-randomnumber-]': randoms.randomnumber,
    '[-randomletters-]': randoms.randomletters,
    '[-randomdS-]': randoms.randomdS,
    '[-randomuuid-]': randoms.randomuuid,
    '[-randomhex-]': randoms.randomhex,
    '[-shortid-]': randoms.shortid,
    '[-randomcolor-]': randoms.randomcolor,
    '[-randompid-]': randoms.randompid,
    '[-randomu-]': randoms.randomu,

    // Technical
    '[-randomclass-]': randoms.randomclass,
    '[-randomid-]': randoms.randomid,
    '[-randommessageid-]': randoms.randommessageid,
    '[-randomboundary-]': randoms.randomboundary,

    // Date/time
    '[-date-]': randoms.date,
    '[-timestamp-]': randoms.timestamp,
    '[-unixtime-]': randoms.unixtime,
    '[-year-]': randoms.year,

    // Special
    '[-emoji-]': randoms.emoji,
  };

  // Also support custom_fields from recipient
  if (recipient.custom_fields && typeof recipient.custom_fields === 'object') {
    for (const [key, value] of Object.entries(recipient.custom_fields)) {
      vars[`[-${key}-]`] = String(value);
    }
  }

  // Perform replacements
  let result = text;
  for (const [token, value] of Object.entries(vars)) {
    // Escape special regex chars in token
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), value);
  }

  // Process spintax {option1|option2|option3}
  result = processSpintax(result);

  return result;
}

/**
 * Replace variables in custom headers text.
 */
export function processHeaders(headersText, recipient, campaignData) {
  return replaceVariables(headersText, recipient, campaignData);
}

/**
 * Generate a unique Message-ID.
 */
export function generateMessageId(domain) {
  return `<${uuidv4()}@${domain || 'mail.moonmailer.pro'}>`;
}
