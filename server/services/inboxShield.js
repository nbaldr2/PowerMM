import juice from 'juice';
import { minify } from 'html-minifier-terser';
import { convert } from 'html-to-text';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import logger from '../utils/logger.js';

// ============================================================
// MIME TRANSFORMS
// ============================================================
export function generatePlainText(html) {
  return convert(html, { wordwrap: 80, selectors: [{ selector: 'img', format: 'skip' }] });
}

export function base64EncodeBody(html) {
  return Buffer.from(html, 'utf8').toString('base64');
}

export function quotedPrintableEncode(str) {
  return str.replace(/[^\x20-\x7E\r\n]|=/g, (c) => {
    return '=' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  });
}

// ============================================================
// HEADER MUTATIONS
// ============================================================
export function rotateHeaders(headersObj) {
  const entries = Object.entries(headersObj);
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return Object.fromEntries(entries);
}

export function addReputationHeaders(headers, domain) {
  return { ...headers, 'X-Mailer': `MoonMailer Pro v2026.${Math.floor(Math.random() * 12) + 1}`, 'X-Originating-IP': '[127.0.0.1]' };
}

export function encodeSubjectBase64(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

export function applyDateJitter(date) {
  return new Date(date.getTime() + (Math.floor(Math.random() * 120) - 60) * 1000);
}

export function addListUnsubscribe(cid, rh, td) {
  const url = `${td}/unsubscribe/${cid}/${rh}`;
  return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

// ============================================================
// HTML FIXES
// ============================================================
export async function inlineCss(html) {
  try { return juice(html, { removeStyleTags: true, preserveImportant: true }); } catch { return html; }
}

export async function minifyHtml(html) {
  try { return await minify(html, { collapseWhitespace: true, removeComments: true, minifyCSS: true }); } catch { return html; }
}

export function wrapInTable(html) {
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="600"><tr><td>${html}</td></tr></table></td></tr></table>`;
}

export function addOutlookFixes(html) {
  return html.replace(/<head([^>]*)>/i, `<head$1><!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important;}</style><![endif]-->`);
}

export function addDarkModeStyles(html) {
  const s = `<style>@media(prefers-color-scheme:dark){.email-body{background:#1a1a2e!important;color:#e0e0e0!important;}}</style>`;
  return html.replace(/<\/head>/i, `${s}</head>`);
}

export function fixImgAlt(html) {
  return html.replace(/<img(?![^>]*\balt\s*=)([^>]*)>/gi, '<img alt="image"$1>');
}

// ============================================================
// STEALTH TRANSFORMS
// ============================================================
export function antiFingerprint(html) {
  return html
    .replace(/class="([^"]*)"/gi, () => `class="c${crypto.randomBytes(4).toString('hex')}"`)
    .replace(/id="([^"]*)"/gi, () => `id="i${crypto.randomBytes(4).toString('hex')}"`);
}

export function normalizeWhitespace(html) {
  return html.replace(/[\t\r]+/g, ' ').replace(/  +/g, ' ');
}

export function styleShuffle(html) {
  return html.replace(/style="([^"]*)"/gi, (m, styles) => {
    const props = styles.split(';').filter(Boolean).map(s => s.trim());
    for (let i = props.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [props[i], props[j]] = [props[j], props[i]]; }
    return `style="${props.join('; ')}"`;
  });
}

export function linkUniquifier(html) {
  return html.replace(/href="(https?:\/\/[^"]*)"/gi, (m, url) => {
    const sep = url.includes('?') ? '&' : '?';
    return `href="${url}${sep}ref=${crypto.randomBytes(3).toString('hex')}"`;
  });
}

export function spamProtector(html) {
  const words = ['free', 'winner', 'urgent', 'expire', 'suspended', 'verify'];
  let r = html;
  for (const w of words) {
    r = r.replace(new RegExp(`\\b(${w})\\b`, 'gi'), (m) => m.length < 3 ? m : m.slice(0, Math.floor(m.length/2)) + '\u200B' + m.slice(Math.floor(m.length/2)));
  }
  return r;
}

export function cleanTrackers(html) {
  return html.replace(/<img[^>]*(?:1x1|tracking|pixel|beacon)[^>]*>/gi, '');
}

// ============================================================
// ANTI-CMAS
// ============================================================
export function addHeaderNoise(headers) {
  const n = {};
  for (let i = 0; i < Math.floor(Math.random() * 3) + 1; i++) {
    n[`X-Ref-${crypto.randomBytes(2).toString('hex')}`] = crypto.randomBytes(8).toString('base64');
  }
  return { ...headers, ...n };
}

export function addFakeReceivedChain(headers, domain) {
  const h = ['gw1.internal', 'mx2.relay.net'][Math.floor(Math.random() * 2)];
  return { ...headers, 'Received': `from ${h} by ${domain} with ESMTPS; ${new Date().toUTCString()}` };
}

export function forgeMessageId(domain) { return `<${uuidv4()}@${domain}>`; }

// ============================================================
// 2026 HEADERS
// ============================================================
export function addArcChain(domain) {
  return { 'ARC-Authentication-Results': `i=1; ${domain}; dkim=pass`, 'ARC-Seal': `i=1; a=rsa-sha256; d=${domain}; cv=none` };
}

export function addEspFingerprint() {
  return { 'X-SG-EID': crypto.randomBytes(16).toString('base64'), 'X-SG-ID': crypto.randomBytes(6).toString('hex') };
}

export function addThreadHeaders() {
  const fid = `<${uuidv4()}@thread.internal>`;
  return { 'In-Reply-To': fid, 'References': fid, 'Thread-Index': Buffer.from(crypto.randomBytes(22)).toString('base64') };
}

// ============================================================
// EITSFAS
// ============================================================
export function injectPreheader(html, text) {
  const ph = `<div style="display:none;font-size:1px;color:#f6f6f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${text}</div>`;
  return html.replace(/<body([^>]*)>/i, `<body$1>${ph}`);
}

export function injectPixelTracker(html, url) {
  return html.replace(/<\/body>/i, `<img src="${url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;"/></body>`);
}

export function wrapLinksWithTracking(html, base, cid, rh) {
  let idx = 0;
  return html.replace(/href="(https?:\/\/[^"]*)"/gi, (m, u) => {
    return `href="${base}/track/click/${cid}/${rh}/${idx++}?url=${encodeURIComponent(u)}"`;
  });
}

// ============================================================
// MAIN PIPELINE
// ============================================================
export async function applyInboxShield(email, settings = {}, context = {}) {
  let { html, text, headers = {}, subject } = email;
  const { campaignId, recipientHash, trackingDomain, fromDomain } = context;
  let contentTransferEncoding = '7bit';

  if (settings.multipart && html && !text) text = generatePlainText(html);
  if (settings.cssInliner && html) html = await inlineCss(html);
  if (settings.fixImgAlt && html) html = fixImgAlt(html);
  if (settings.tableWrapper && html) html = wrapInTable(html);
  if (settings.outlookFixes && html) html = addOutlookFixes(html);
  if (settings.darkMode && html) html = addDarkModeStyles(html);
  if (settings.cleanTrackers && html) html = cleanTrackers(html);
  if (settings.antiFingerprint && html) html = antiFingerprint(html);
  if (settings.normalizeWs && html) html = normalizeWhitespace(html);
  if (settings.styleShuffle && html) html = styleShuffle(html);
  if (settings.linkUniquifier && html) html = linkUniquifier(html);
  if (settings.spamProtector && html) html = spamProtector(html);
  if (settings.preheader && html) html = injectPreheader(html, settings.preheader);
  if (settings.pixelTracker && trackingDomain && campaignId) {
    html = injectPixelTracker(html, `${trackingDomain}/track/open/${campaignId}/${recipientHash}`);
  }
  if (settings.trackingUrl && trackingDomain && campaignId) {
    html = wrapLinksWithTracking(html, trackingDomain, campaignId, recipientHash);
  }
  if (settings.minifyHtml && html) html = await minifyHtml(html);
  if (settings.base64Encode) contentTransferEncoding = 'base64';
  else if (settings.quotedPrintable) contentTransferEncoding = 'quoted-printable';
  if (settings.reputationHeaders) headers = addReputationHeaders(headers, fromDomain);
  if (settings.subjectEncode && subject) subject = encodeSubjectBase64(subject);
  if (settings.dateJitter) headers['Date'] = applyDateJitter(new Date()).toUTCString();
  if (settings.listUnsubscribe && trackingDomain) Object.assign(headers, addListUnsubscribe(campaignId, recipientHash, trackingDomain));
  if (settings.headerRotation) headers = rotateHeaders(headers);
  if (settings.headerNoise) headers = addHeaderNoise(headers);
  if (settings.receivedChain) headers = addFakeReceivedChain(headers, fromDomain);
  if (settings.messageIdForge) headers['Message-ID'] = forgeMessageId(fromDomain);
  if (settings.rfc8058Full && trackingDomain) Object.assign(headers, addListUnsubscribe(campaignId, recipientHash, trackingDomain));
  if (settings.arcChain) Object.assign(headers, addArcChain(fromDomain));
  if (settings.espFingerprint) Object.assign(headers, addEspFingerprint());
  if (settings.threadInject) Object.assign(headers, addThreadHeaders());

  return { html, text, headers, subject, contentTransferEncoding };
}
