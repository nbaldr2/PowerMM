import { Router } from 'express';
import dns from 'dns';
import { promisify } from 'util';
import { authenticate } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();
const resolve4 = promisify(dns.resolve4);
const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);
const reverse = promisify(dns.reverse);

// DNSBL lists to check
const BLACKLISTS = [
  { name: 'Spamhaus ZEN', host: 'zen.spamhaus.org', removalUrl: 'https://www.spamhaus.org/lookup/' },
  { name: 'Barracuda', host: 'b.barracudacentral.org', removalUrl: 'https://www.barracudacentral.org/lookups/lookup-reputation' },
  { name: 'SpamCop', host: 'bl.spamcop.net', removalUrl: 'https://www.spamcop.net/bl.shtml' },
  { name: 'SORBS', host: 'dnsbl.sorbs.net', removalUrl: 'http://www.sorbs.net/lookup.shtml' },
  { name: 'UCEPROTECT L1', host: 'dnsbl-1.uceprotect.net', removalUrl: 'https://www.uceprotect.net/en/rblcheck.php' },
  { name: 'Composite BL', host: 'cbl.abuseat.org', removalUrl: 'https://www.abuseat.org/lookup.html' },
  { name: 'PSBL', host: 'psbl.surriel.com', removalUrl: 'https://psbl.org/' },
  { name: 'Invaluement', host: 'dnsbl.invaluement.com', removalUrl: 'https://www.invaluement.com/lookup/' },
];

/**
 * Check if an IP is listed in a DNSBL.
 */
async function checkDnsbl(ip, dnsblHost) {
  const parts = ip.split('.').reverse().join('.');
  const lookup = `${parts}.${dnsblHost}`;
  try {
    const results = await resolve4(lookup);
    return { listed: true, result: results[0] };
  } catch {
    return { listed: false };
  }
}

// POST /ipchecker/check — full IP reputation check
router.post('/check', authenticate, async (req, res) => {
  const { ip, domain } = req.body;
  let targetIp = ip;

  if (!targetIp && domain) {
    try {
      const ips = await resolve4(domain);
      targetIp = ips[0];
    } catch {
      return res.status(400).json({ error: 'Could not resolve domain to IP' });
    }
  }

  if (!targetIp) return res.status(400).json({ error: 'IP or domain required' });

  const results = [];
  let listedCount = 0;

  // Check all blacklists in parallel
  const checks = BLACKLISTS.map(async (bl) => {
    const result = await checkDnsbl(targetIp, bl.host);
    if (result.listed) listedCount++;
    return { ...bl, ...result };
  });

  const blacklistResults = await Promise.all(checks);

  // PTR lookup
  let ptr = null;
  try { const ptrs = await reverse(targetIp); ptr = ptrs[0]; } catch {}

  // DNS records for domain
  let spf = null, dkim = null, dmarc = null, mx = null;
  const targetDomain = domain || ptr;
  if (targetDomain) {
    try { const txts = await resolveTxt(targetDomain); spf = txts.flat().find(t => t.startsWith('v=spf1')); } catch {}
    try { const txts = await resolveTxt(`dkim._domainkey.${targetDomain}`); dkim = txts.flat().join(''); } catch {}
    try { const txts = await resolveTxt(`_dmarc.${targetDomain}`); dmarc = txts.flat().find(t => t.startsWith('v=DMARC1')); } catch {}
    try { mx = await resolveMx(targetDomain); } catch {}
  }

  // Calculate reputation score
  const score = Math.max(0, 100 - (listedCount * 15));

  res.json({
    ip: targetIp,
    domain: targetDomain,
    reputationScore: score,
    blacklists: blacklistResults,
    listedCount,
    totalChecked: BLACKLISTS.length,
    ptr,
    dns: { spf, dkim, dmarc, mx },
  });
});

// POST /ipchecker/warmup — generate warmup schedule
router.post('/warmup', authenticate, async (req, res) => {
  const { targetVolume, startVolume } = req.body;
  const target = parseInt(targetVolume) || 10000;
  let current = parseInt(startVolume) || 50;
  const schedule = [];
  let day = 1;

  while (current < target) {
    schedule.push({ day, volume: Math.min(current, target) });
    current = Math.min(Math.floor(current * 1.5), target);
    day++;
    if (day > 60) break; // max 60 days
  }
  schedule.push({ day, volume: target });

  res.json({ schedule, totalDays: day, targetVolume: target });
});

export default router;
