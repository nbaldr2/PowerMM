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
  { name: 'Spamhaus SBL', host: 'sbl.spamhaus.org', removalUrl: 'https://www.spamhaus.org/lookup/' },
  { name: 'Spamhaus ZEN', host: 'zen.spamhaus.org', removalUrl: 'https://www.spamhaus.org/lookup/' },
  { name: 'Spamhaus PBL', host: 'pbl.spamhaus.org', removalUrl: 'https://www.spamhaus.org/lookup/' },
  { name: 'Spamhaus XBL', host: 'xbl.spamhaus.org', removalUrl: 'https://www.spamhaus.org/lookup/' },
  { name: '0spam Project', host: 'bl.0spam.org', removalUrl: 'https://0spam.org/' },
  { name: 'Abuse.ch Urlhaus IPs', host: 'urlhaus.abuse.ch', removalUrl: 'https://urlhaus.abuse.ch/' },
  { name: 'Abuse.ro RBL', host: 'rbl.abuse.ro', removalUrl: 'https://abuse.ro/' },
  { name: 'Composite Blocking List', host: 'cbl.abuseat.org', removalUrl: 'https://www.abuseat.org/lookup.html' },
  { name: 'Abusix Mail Intelligence Spam', host: 'black.mail.abusix.zone', removalUrl: 'https://abusix.com/' },
  { name: 'Abusix Mail Intelligence Exploit', host: 'exploit.mail.abusix.zone', removalUrl: 'https://abusix.com/' },
  { name: 'Anonmails', host: 'spam.dnsbl.anonmails.de', removalUrl: 'https://anonmails.de/' },
  { name: 'Barracuda RBL', host: 'b.barracudacentral.org', removalUrl: 'https://www.barracudacentral.org/lookups/lookup-reputation' },
  { name: 'JIPPG Relay Blackhole', host: 'mail-abuse.blacklist.jippg.org', removalUrl: 'https://jippg.org/' },
  { name: 'BlockedServers', host: 'rbl.blockedservers.com', removalUrl: 'https://blockedservers.com/' },
  { name: 'Blocklist.de', host: 'bl.blocklist.de', removalUrl: 'https://www.blocklist.de/' },
  { name: 'Calivent', host: 'dnsbl.calivent.com.pe', removalUrl: 'https://calivent.com/' },
  { name: 'Dan.me.uk Tor exit', host: 'torexit.dan.me.uk', removalUrl: 'https://www.dan.me.uk/' },
  { name: 'DNS-SERVICIOS RBL', host: 'rbl.dns-servicios.com', removalUrl: 'https://dns-servicios.com/' },
  { name: 'DrMX', host: 'bl.drmx.org', removalUrl: 'https://drmx.org/' },
  { name: 'DroneBL', host: 'dnsbl.dronebl.org', removalUrl: 'https://dronebl.org/' },
  { name: 'EFnet TOR', host: 'rbl.efnetrbl.org', removalUrl: 'https://rbl.efnet.org/' },
  { name: 'Fabel Spamsources', host: 'spamsources.fabel.dk', removalUrl: 'https://fabel.dk/' },
  { name: 'fnrbl.fast.net', host: 'fnrbl.fast.net', removalUrl: 'https://fast.net/' },
  { name: 'pofon.foobar.hu', host: 'pofon.foobar.hu', removalUrl: 'https://foobar.hu/' },
  { name: 'truncate.gbudb.net', host: 'truncate.gbudb.net', removalUrl: 'https://gbudb.net/' },
  { name: 'Project Honey Pot', host: 'dnsbl.httpbl.org', removalUrl: 'https://www.projecthoneypot.org/' },
  { name: 'ImproWare Spamlist', host: 'spamrbl.imp.ch', removalUrl: 'https://imp.ch/' },
  { name: 'ImproWare Wormlist', host: 'wormrbl.imp.ch', removalUrl: 'https://imp.ch/' },
  { name: 'InterServer BL', host: 'rbl.interserver.net', removalUrl: 'https://rbl.interserver.net/' },
  { name: 'Invaluement RBL SIP', host: 'dnsbl.invaluement.com', removalUrl: 'https://www.invaluement.com/lookup/' },
  { name: 'Hostkarma', host: 'hostkarma.junkemailfilter.com', removalUrl: 'https://junkemailfilter.com/' },
  { name: 'JustSpam.org', host: 'dnsbl.justspam.org', removalUrl: 'https://www.justspam.org/' },
  { name: 'Kempt.net DNSBL', host: 'dnsbl.kempt.net', removalUrl: 'https://kempt.net/' },
  { name: 'KONSTANT DNSBL', host: 'bl.konstant.no', removalUrl: 'https://konstant.no/' },
  { name: 'LashBack UBL', host: 'ubl.unsubscore.com', removalUrl: 'https://www.lashback.com/' },
  { name: 'Leadmon.Net SpamGuard', host: 'spamguard.leadmon.net', removalUrl: 'https://leadmon.net/' },
  { name: 'Mailspike Blacklist', host: 'bl.mailspike.net', removalUrl: 'https://mailspike.net/' },
  { name: 'dnsbl.net.ua', host: 'dnsbl.net.ua', removalUrl: 'https://dnsbl.net.ua/' },
  { name: 'NordSpam IP', host: 'bl.nordspam.com', removalUrl: 'https://nordspam.com/' },
  { name: 'NoSolicitado.org', host: 'bl.nosolicitado.org', removalUrl: 'https://nosolicitado.org/' },
  { name: 'NoSolicitado Worst BL', host: 'bl.worst.nosolicitado.org', removalUrl: 'https://nosolicitado.org/' },
  { name: 'Pedantic.org Spam', host: 'spam.pedantic.org', removalUrl: 'https://pedantic.org/' },
  { name: 'RV-SOFT DNSBL', host: 'dnsbl.rv-soft.info', removalUrl: 'https://rv-soft.info/' },
  { name: 'all.s5h.net', host: 'all.s5h.net', removalUrl: 'https://s5h.net/' },
  { name: 'Scientific Spam IPs', host: 'bl.scientificspam.net', removalUrl: 'https://scientificspam.net/' },
  { name: 'Scrollout F1 IP RBL', host: 'bl-ip.rbl.scrolloutf1.com', removalUrl: 'https://scrolloutf1.com/' },
  { name: 'South Korean Network BL', host: 'korea.services.net', removalUrl: 'https://korea.services.net/' },
  { name: 'Spamcop', host: 'bl.spamcop.net', removalUrl: 'https://www.spamcop.net/bl.shtml' },
  { name: 'Spam Eating Monkey SEM-BLACK', host: 'bl.spameatingmonkey.net', removalUrl: 'https://spameatingmonkey.com/' },
  { name: 'Spam Eating Monkey SEM-BACKSCATTER', host: 'backscatter.spameatingmonkey.net', removalUrl: 'https://spameatingmonkey.com/' },
  { name: 'SpamRATS', host: 'all.spamrats.com', removalUrl: 'https://www.spamrats.com/' },
  { name: 'SPFBL DNSBL', host: 'dnsbl.spfbl.net', removalUrl: 'https://spfbl.net/' },
  { name: 'Suomispam', host: 'bl.suomispam.net', removalUrl: 'https://suomispam.net/' },
  { name: 'Passive Spam Block List', host: 'psbl.surriel.com', removalUrl: 'https://psbl.org/' },
  { name: 'Swinog Blacklist', host: 'dnsrbl.swinog.ch', removalUrl: 'https://swinog.ch/' },
  { name: 'rbl.talkactive.net', host: 'rbl.talkactive.net', removalUrl: 'https://talkactive.net/' },
  { name: 'TechnoVision SpamTrap', host: 'st.technovision.dk', removalUrl: 'https://technovision.dk/' },
  { name: 'Tornevall Networks DNSBL', host: 'dnsbl.tornevall.org', removalUrl: 'https://tornevall.net/' },
  { name: 'TRIUMF.ca DNSBL', host: 'rbl2.triumf.ca', removalUrl: 'https://triumf.ca/' },
  { name: 'UCEPROTECT Level 1', host: 'dnsbl-1.uceprotect.net', removalUrl: 'https://www.uceprotect.net/en/rblcheck.php' },
  { name: 'Woody SMTP Blacklist', host: 'blacklist.woody.ch', removalUrl: 'https://woody.ch/' },
  { name: 'ZapBL DNSRBL', host: 'dnsbl.zapbl.net', removalUrl: 'https://zapbl.net/' },
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
  logger.info(`Checking DNS for domain: ${targetDomain} (IP: ${targetIp}, provided domain: ${domain}, PTR: ${ptr})`);
  
  if (targetDomain) {
    // Clean domain (remove trailing dot if present)
    const cleanDomain = targetDomain.replace(/\.$/, '');
    logger.info(`Clean domain: ${cleanDomain}`);
    
    // SPF - check TXT records for v=spf1 or spf2.0 (case insensitive)
    try { 
      const txts = await resolveTxt(cleanDomain); 
      const flatTxts = txts.flat();
      logger.info(`SPF TXT records for ${cleanDomain}: ${JSON.stringify(flatTxts)}`);
      spf = flatTxts.find(t => /^v=spf[12]/i.test(t)) || flatTxts.find(t => t.toLowerCase().includes('spf'));
      if (spf) logger.info(`Found SPF: ${spf.substring(0, 100)}`);
    } catch (err) {
      logger.warn(`SPF lookup failed for ${cleanDomain}: ${err.message}`);
    }
    
    // DKIM - try multiple common selectors
    const dkimSelectors = ['dkim', 'default', 'mail', 'google', 'selector1', 'selector2', 'k1', 'key1'];
    for (const selector of dkimSelectors) {
      try { 
        const txts = await resolveTxt(`${selector}._domainkey.${cleanDomain}`); 
        const dkimRecord = txts.flat().join('');
        logger.info(`DKIM ${selector}: ${dkimRecord.substring(0, 50)}...`);
        if (dkimRecord && dkimRecord.includes('p=')) {
          dkim = `Selector: ${selector} | ${dkimRecord.substring(0, 100)}...`;
          break;
        }
      } catch {}
    }
    if (!dkim) logger.info(`No DKIM found for ${cleanDomain}`);
    
    // DMARC
    try { 
      const txts = await resolveTxt(`_dmarc.${cleanDomain}`); 
      const flatTxts = txts.flat();
      logger.info(`DMARC TXT records: ${JSON.stringify(flatTxts)}`);
      dmarc = flatTxts.find(t => /^v=DMARC1/i.test(t));
      if (dmarc) logger.info(`Found DMARC: ${dmarc}`);
    } catch (err) {
      logger.warn(`DMARC lookup failed: ${err.message}`);
    }
    
    // MX
    try { 
      const mxRecords = await resolveMx(cleanDomain);
      logger.info(`MX records: ${JSON.stringify(mxRecords)}`);
      if (mxRecords && mxRecords.length > 0) {
        mxRecords.sort((a, b) => a.priority - b.priority);
        mx = mxRecords.map(r => `${r.exchange} (prio ${r.priority})`).join(', ');
      }
    } catch (err) {
      logger.warn(`MX lookup failed: ${err.message}`);
    }
  } else {
    logger.warn('No target domain available for DNS lookup');
  }
    
    // DKIM - try multiple common selectors
    const dkimSelectors = ['dkim', 'default', 'mail', 'google', 'selector1', 'selector2', 'k1', 'key1'];
    for (const selector of dkimSelectors) {
      try { 
        const txts = await resolveTxt(`${selector}._domainkey.${cleanDomain}`); 
        const dkimRecord = txts.flat().join('');
        logger.info(`DKIM ${selector}: ${dkimRecord.substring(0, 50)}...`);
        if (dkimRecord && dkimRecord.includes('p=')) {
          dkim = `Selector: ${selector} | ${dkimRecord.substring(0, 100)}...`;
          break;
        }
      } catch {}
    }
    if (!dkim) logger.info(`No DKIM found for ${cleanDomain}`);
    
    // DMARC
    try { 
      const txts = await resolveTxt(`_dmarc.${cleanDomain}`); 
      const flatTxts = txts.flat();
      logger.info(`DMARC TXT records: ${JSON.stringify(flatTxts)}`);
      dmarc = flatTxts.find(t => /^v=DMARC1/i.test(t));
      if (dmarc) logger.info(`Found DMARC: ${dmarc}`);
    } catch (err) {
      logger.warn(`DMARC lookup failed: ${err.message}`);
    }
    
    // MX
    try { 
      const mxRecords = await resolveMx(cleanDomain);
      logger.info(`MX records: ${JSON.stringify(mxRecords)}`);
      if (mxRecords && mxRecords.length > 0) {
        mxRecords.sort((a, b) => a.priority - b.priority);
        mx = mxRecords.map(r => `${r.exchange} (prio ${r.priority})`).join(', ');
      }
    } catch (err) {
      logger.warn(`MX lookup failed: ${err.message}`);
    }
  } else {
    logger.warn('No target domain available for DNS lookup');
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
