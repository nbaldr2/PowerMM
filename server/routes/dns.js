import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateDkimKeypair, buildDnsRecords, buildDkimConfigSnippet, buildVmtaBlocks } from '../utils/dkimGenerator.js';
import { validateDomain, validateIp, validateSelector, normalizeSecondaryIps } from '../utils/validator.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/generate', authenticate, (req, res) => {
  const { sendingDomain, hostname, primaryIP, secondaryIPs, dkimSelector, postmaster } = req.body;

  const domainCheck = validateDomain(sendingDomain);
  if (!domainCheck.valid) return res.status(400).json({ error: domainCheck.error });
  const domain = domainCheck.domain;

  const ipCheck = validateIp(primaryIP);
  if (!ipCheck.valid) return res.status(400).json({ error: ipCheck.error });
  const ip = ipCheck.ip;

  const selectorCheck = validateSelector(dkimSelector);
  if (!selectorCheck.valid) return res.status(400).json({ error: selectorCheck.error });
  const selector = selectorCheck.selector;

  const secIps = normalizeSecondaryIps(secondaryIPs);
  for (const sec of secIps) {
    const secCheck = validateIp(sec);
    if (!secCheck.valid) return res.status(400).json({ error: `Secondary IP error: ${secCheck.error}` });
  }

  const host = hostname || `mail.${domain}`;

  const { privateKeyPem, publicKeyBase64 } = generateDkimKeypair();
  const hostCheck = validateDomain(host);
  if (!hostCheck.valid) return res.status(400).json({ error: `Invalid hostname: ${hostCheck.error}` });

  const records = buildDnsRecords({
    sendingDomain: domain,
    hostname: host,
    primaryIP: ip,
    secondaryIPs: secIps,
    dkimSelector: selector,
    postmaster: postmaster || `postmaster@${domain}`,
    dkimPublicKey: publicKeyBase64,
  });

  const dkimConfig = buildDkimConfigSnippet(domain, selector, privateKeyPem);
  const vmtaBlocks = buildVmtaBlocks(ip, secIps);

  res.json({
    requestId: uuidv4(),
    generatedAt: new Date().toISOString(),
    dkim: {
      selector,
      privateKeyPem,
      publicKeyBase64,
    },
    records,
    config: {
      dkim: dkimConfig,
      vmtas: vmtaBlocks.vmtas,
      pool: vmtaBlocks.pool,
    },
    secondaryIps: secIps,
  });
});

router.post('/validate-domain', (req, res) => {
  const result = validateDomain(req.body.domain);
  res.json(result);
});

router.post('/validate-ip', (req, res) => {
  const result = validateIp(req.body.ip);
  res.json(result);
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', module: 'dns-generator' });
});

export default router;
