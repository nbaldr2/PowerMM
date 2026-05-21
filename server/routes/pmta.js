import { Router } from 'express';
import { Client as SSHClient } from 'ssh2';
import { query } from '../config/database.js';
import env from '../config/env.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import crypto from 'crypto';
import forge from 'node-forge';
import logger from '../utils/logger.js';
import fs from 'fs/promises';

const router = Router();

// Active SSH connections (per-session, never persisted)
const sshSessions = new Map();

function sshExec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', (code) => resolve({ stdout, stderr, code }));
    });
  });
}

// POST /pmta/test-ssh — test SSH connection
router.post('/test-ssh', authenticate, authorize('admin'), async (req, res) => {
  const { host, port, username, password, privateKey, useLocalServer } = req.body;
  if (useLocalServer) return res.json({ success: true, message: 'Local server mode — no SSH needed' });
  if (!host) return res.status(400).json({ error: 'SSH host required' });

  const conn = new SSHClient();
  const timeout = setTimeout(() => { conn.end(); res.status(408).json({ error: 'Connection timeout' }); }, 15000);

  conn.on('ready', async () => {
    clearTimeout(timeout);
    try {
      const { stdout } = await sshExec(conn, 'hostname && uname -r');
      sshSessions.set(req.user.id, conn);
      res.json({ success: true, message: `Connected as ${username} to ${host}:${port || 22}`, details: stdout.trim() });
    } catch (err) {
      conn.end();
      res.status(500).json({ error: err.message });
    }
  });

  conn.on('error', (err) => {
    clearTimeout(timeout);
    logger.error('SSH connection error:', err.message);
    res.status(401).json({ error: `SSH auth failed: ${err.message}` });
  });

  const connOpts = { host, port: port || 22, username: username || 'root', readyTimeout: 12000 };
  if (privateKey) { connOpts.privateKey = privateKey; }
  else if (password) { connOpts.password = password; }
  conn.connect(connOpts);
});

// POST /pmta/config — save PMTA configuration
router.post('/config', authenticate, authorize('admin'), validate(schemas.pmtaConfig), async (req, res) => {
  const d = req.validated;
  const passEncrypted = d.smtp_pass ? encrypt(d.smtp_pass) : null;

  // Generate DKIM keypair
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
  // Extract the base64 content for DNS TXT record
  const publicKeyBase64 = publicKeyPem.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\n/g, '');

  const { rows } = await query(
    `INSERT INTO pmta_configs (user_id, server_name, ssh_host, ssh_port, ssh_user, domain, hostname,
       primary_ip, secondary_ips, dkim_selector, dkim_private_key, dkim_public_key,
       smtp_user, smtp_pass_encrypted, smtp_port, monitor_port, config_text, isp_rules)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (user_id) DO UPDATE SET
       server_name = EXCLUDED.server_name,
       ssh_host = EXCLUDED.ssh_host,
       ssh_port = EXCLUDED.ssh_port,
       ssh_user = EXCLUDED.ssh_user,
       domain = EXCLUDED.domain,
       hostname = EXCLUDED.hostname,
       primary_ip = EXCLUDED.primary_ip,
       secondary_ips = EXCLUDED.secondary_ips,
       dkim_selector = EXCLUDED.dkim_selector,
       dkim_private_key = EXCLUDED.dkim_private_key,
       dkim_public_key = EXCLUDED.dkim_public_key,
       smtp_user = EXCLUDED.smtp_user,
       smtp_pass_encrypted = EXCLUDED.smtp_pass_encrypted,
       smtp_port = EXCLUDED.smtp_port,
       monitor_port = EXCLUDED.monitor_port,
       config_text = EXCLUDED.config_text,
       isp_rules = EXCLUDED.isp_rules,
       updated_at = NOW()
     RETURNING *`,
    [req.user.id, d.server_name || 'Default', d.ssh_host, d.ssh_port, d.ssh_user,
     d.domain, d.hostname || d.domain, d.primary_ip, d.secondary_ips || '',
     d.dkim_selector, privateKeyPem, publicKeyBase64,
     d.smtp_user || '', passEncrypted, d.smtp_port, d.monitor_port,
     d.config_text || '', JSON.stringify(d.isp_rules || [])]
  );

  res.status(201).json({ config: rows[0], dkimPublicKey: publicKeyBase64 });
});

// GET /pmta/config
router.get('/config', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM pmta_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [req.user.id]
  );
  if (rows.length === 0) return res.json({ config: null });
  res.json({ config: rows[0] });
});

// POST /pmta/dns-records — generate DNS records
router.post('/dns-records', authenticate, async (req, res) => {
  const { domain, primaryIp, secondaryIps, dkimSelector, hostname } = req.body;
  const secIps = (secondaryIps || '').split('\n').map(i => i.trim()).filter(Boolean);

  const spfIps = [primaryIp, ...secIps].map(ip => `ip4:${ip}`).join(' ');
  const records = [
    { type: 'A', host: hostname || domain, value: primaryIp },
    { type: 'MX', host: '@', value: `10 ${hostname || domain}`, note: 'Priority 10' },
    { type: 'TXT', host: '@', value: `v=spf1 ${spfIps} -all`, label: 'SPF' },
    { type: 'TXT', host: `${dkimSelector || 'dkim'}._domainkey`, value: `v=DKIM1; k=rsa; p=[PUBLIC_KEY_HERE]`, label: 'DKIM' },
    { type: 'TXT', host: '_dmarc', value: `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@${domain}`, label: 'DMARC' },
    { type: 'PTR', host: primaryIp, value: hostname || domain, note: 'Configure with hosting provider' },
  ];
  res.json({ records });
});

// POST /pmta/service/:action — control PMTA service via SSH
router.post('/service/:action', authenticate, authorize('admin'), async (req, res) => {
  const { action } = req.params;
  const validActions = ['status', 'start', 'stop', 'restart', 'reload'];
  if (!validActions.includes(action)) return res.status(400).json({ error: 'Invalid action' });

  const conn = sshSessions.get(req.user.id);
  if (!conn) return res.status(400).json({ error: 'No active SSH session. Connect first.' });

  try {
    const cmd = action === 'reload' ? 'pmta reload' : `systemctl ${action} pmta`;
    const result = await sshExec(conn, cmd);
    if (action === 'status') {
      const { stdout: statusOut } = await sshExec(conn, 'systemctl is-active pmta');
      result.isRunning = statusOut.trim() === 'active';
    }
    res.json({ success: true, output: result.stdout || result.stderr, code: result.code, isRunning: result.isRunning });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /pmta/install — install PowerMTA via SSH
router.post('/install', authenticate, authorize('admin'), async (req, res) => {
  const conn = sshSessions.get(req.user.id);
  if (!conn) return res.status(400).json({ error: 'No active SSH session. Connect via Step 1 first.' });

  const { rows } = await query('SELECT * FROM pmta_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [req.user.id]);
  if (rows.length === 0) return res.status(400).json({ error: 'No PMTA config saved. Complete Step 2 first.' });
  const config = rows[0];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  const send = (msg) => {
    res.write(`data: ${JSON.stringify({ message: msg, timestamp: new Date().toISOString() })}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  const sshExecSafe = async (cmd, timeout = 60000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Command timeout: ${cmd.substring(0, 50)}...`)), timeout);
      conn.exec(cmd, (err, stream) => {
        if (err) { clearTimeout(timer); return reject(err); }
        let stdout = '', stderr = '';
        stream.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code }); });
        stream.on('data', (d) => { stdout += d.toString(); });
        stream.stderr.on('data', (d) => { stderr += d.toString(); });
      });
    });
  };

  try {
    send('Detecting operating system...');
    const { stdout: osInfo } = await sshExecSafe('cat /etc/os-release | head -10 && uname -m');
    send(`OS: ${osInfo.trim().split('\n')[0]}`);

    const isAlmaOrRhel = /almalinux|rocky|centos|rhel|red hat/i.test(osInfo);
    if (!isAlmaOrRhel) {
      send('⚠️ Warning: PowerMTA RPM is designed for AlmaLinux/RHEL/CentOS. Proceeding anyway...');
    }

    send('Installing system dependencies...');
    await sshExecSafe('yum install -y openssl curl wget unzip 2>/dev/null || dnf install -y openssl curl wget unzip', 120000);
    send('Dependencies installed');

    send('Creating PowerMTA directories...');
    await sshExecSafe('rm -rf /root/PMTA && mkdir -p /root/PMTA /etc/pmta/keys /var/spool/pmta /var/log/pmta');
    send('Directories created');

    const apiBase = `${req.protocol}://${req.get('host')}`;
    const zipUrl = `${apiBase}/pmta-files/PowerMTA5.zip`;
    send('Checking PowerMTA package source...');
    const { stdout: zipHttpCode } = await sshExecSafe(`curl -sSL -o /dev/null -w "%{http_code}" -I "${zipUrl}" || echo 000`, 20000);
    const zipAvailable = (zipHttpCode || '').trim().startsWith('200');

    if (zipAvailable) {
      send('Downloading PowerMTA5.zip from server...');
      await sshExecSafe(`curl -sSL "${zipUrl}" -o /root/PowerMTA5.zip`, 120000);

      send('Extracting PowerMTA5.zip...');
      await sshExecSafe('cd /root/PMTA && (unzip -o /root/PowerMTA5.zip >/dev/null 2>&1 || (command -v bsdtar >/dev/null 2>&1 && bsdtar -xf /root/PowerMTA5.zip -C /root/PMTA))', 120000);

      send('Installing PowerMTA RPM package(s)...');
      await sshExecSafe(`RPM_LIST=$(find /root/PMTA -maxdepth 6 -type f -name '*.rpm' | tr '\n' ' '); if [ -n "$RPM_LIST" ]; then rpm -ivh $RPM_LIST 2>&1 || true; else echo "No RPM files found in PowerMTA5.zip"; fi`, 180000);
      send('PowerMTA package installed from zip');
    } else {
      send('PowerMTA5.zip not found on server. Falling back to RPM downloads...');
      const rpmUrls = [
        `${apiBase}/pmta-files/PowerMTA-5.0r8.rpm`,
        `${apiBase}/pmta-files/PowerMTA-api-5.0r8.rpm`,
        `${apiBase}/pmta-files/PowerMTA-snmp-5.0r8.rpm`,
      ];
      for (const url of rpmUrls) {
        const filename = url.split('/').pop();
        send(`Downloading ${filename}...`);
        await sshExecSafe(`curl -sSL "${url}" -o /root/PMTA/${filename}`, 60000);
      }
      send('Installing PowerMTA RPM packages...');
      await sshExecSafe('rpm -ivh /root/PMTA/PowerMTA-5.0r8.rpm /root/PMTA/PowerMTA-api-5.0r8.rpm /root/PMTA/PowerMTA-snmp-5.0r8.rpm 2>&1 || true', 120000);
      send('RPM packages installed');
    }

    send('Stopping existing PowerMTA services...');
    await sshExecSafe('service pmta stop 2>/dev/null || true');
    await sshExecSafe('service pmtahttp stop 2>/dev/null || true');
    await sshExecSafe('pkill -f pmtad 2>/dev/null || true');
    await sshExecSafe('pkill -f pmtahttpd 2>/dev/null || true');

    send('Patching PowerMTA binaries...');
    await sshExecSafe('rm -f /usr/sbin/pmtad /usr/sbin/pmtahttpd');
    await sshExecSafe("find /root/PMTA -maxdepth 6 -type f \\( -name pmtad -o -name pmtahttpd \\) -exec cp -f {} /usr/sbin/ \\; 2>/dev/null || true");
    await sshExecSafe('chmod 755 /usr/sbin/pmtad /usr/sbin/pmtahttpd 2>/dev/null || true');
    send('Binaries patched');

    send('Writing license file...');
    let licenseContent = '';
    if (env.PMTA_LICENSE_PATH) {
      licenseContent = await fs.readFile(env.PMTA_LICENSE_PATH, 'utf8');
    } else if (env.PMTA_LICENSE_CONTENT) {
      licenseContent = env.PMTA_LICENSE_CONTENT;
    }
    if (!licenseContent.trim()) {
      throw new Error('Missing PowerMTA license. Set PMTA_LICENSE_PATH or PMTA_LICENSE_CONTENT on the API server.');
    }
    const licenseDelimiter = `LICENSEEOF_${crypto.randomBytes(8).toString('hex')}`;
    await sshExecSafe(`cat > /etc/pmta/license << '${licenseDelimiter}'\n${licenseContent}\n${licenseDelimiter}`);
    send('License installed');

    send('Generating DKIM keypair...');
    const { rows: [updatedConfig] } = await query(
      'SELECT * FROM pmta_configs WHERE id = $1',
      [config.id]
    );
    const dkimPath = `/etc/pmta/keys/${config.domain}.${config.dkim_selector}.pem`;
    await sshExecSafe(`mkdir -p /etc/pmta/keys`);
    await sshExecSafe(`openssl genrsa -out ${dkimPath} 2048 2>&1`);
    await sshExecSafe(`chmod 600 ${dkimPath}`);
    const { stdout: pubKey } = await sshExecSafe(`openssl rsa -in ${dkimPath} -pubout 2>/dev/null | grep -v "---" | tr -d '\\n'`);
    send(`DKIM key generated`);

    send('Writing PowerMTA configuration...');
    let configText = updatedConfig.config_text || '';
    configText = configText.replace(/\{\{\s*domain\s*\}\}/g, config.domain);
    configText = configText.replace(/\{\{\s*hostname\s*\}\}/g, config.hostname || config.domain);
    configText = configText.replace(/\{\{\s*primary_ip\s*\}\}/g, config.primary_ip);
    configText = configText.replace(/\{\{\s*ip\s*\}\}/g, config.primary_ip);
    configText = configText.replace(/\{\{\s*smtp_user\s*\}\}/g, config.smtp_user || '');
    configText = configText.replace(/\{\{\s*smtp_pass\s*\}\}/g, config.smtp_pass_encrypted ? decrypt(config.smtp_pass_encrypted) : '');
    configText = configText.replace(/\{\{\s*smtp_port\s*\}\}/g, String(config.smtp_port || 2525));
    configText = configText.replace(/\{\{\s*dkim_selector\s*\}\}/g, config.dkim_selector || 'dkim');
    configText = configText.replace(/\{\{\s*monitor_port\s*\}\}/g, String(config.monitor_port || 1983));

    if (config.secondary_ips) {
      const secIps = config.secondary_ips.split('\n').map(i => i.trim()).filter(Boolean);
      let vmtaBlocks = '';
      let poolEntries = '';
      secIps.forEach((ip, idx) => {
        const vmtaName = `vmta-${idx + 1}`;
        vmtaBlocks += `\n<virtual-mta ${vmtaName}>\n    smtp-source-ip ${ip}\n</virtual-mta>\n`;
        poolEntries += `    add-vmta ${vmtaName}\n`;
      });
      configText = configText.replace('{{ SECONDARY_VMTA_BLOCKS }}', vmtaBlocks);
      configText = configText.replace('{{ SECONDARY_VMTA_POOL_ENTRIES }}', poolEntries ? `\n<virtual-mta-pool pool>\n${poolEntries}</virtual-mta-pool>` : '');
    }

    await sshExecSafe(`cat > /etc/pmta/config << 'CONFIGEOF'\n${configText}\nCONFIGEOF`);
    send('Configuration written to /etc/pmta/config');

    send('Starting PowerMTA service...');
    await sshExecSafe('chkconfig --add pmta 2>/dev/null || systemctl daemon-reload 2>/dev/null || true');
    await sshExecSafe('service pmta start 2>&1 || pmtad 2>&1 &', 30000);
    await sshExecSafe('service pmtahttp start 2>&1 || pmtahttpd 2>&1 &', 15000);
    send('PowerMTA service started');

    send('Configuring firewall...');
    const smtpPort = Number(config.smtp_port || 2525);
    const monitorPort = Number(config.monitor_port || 1983);
    const firewallCmd = `
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=${smtpPort}/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=${monitorPort}/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  echo firewalld
elif command -v ufw >/dev/null 2>&1; then
  ufw allow ${smtpPort}/tcp >/dev/null 2>&1 || true
  ufw allow ${monitorPort}/tcp >/dev/null 2>&1 || true
  ufw reload >/dev/null 2>&1 || true
  echo ufw
else
  echo none
fi
`.trim().replace(/\n/g, '; ');
    const { stdout: fw } = await sshExecSafe(firewallCmd, 30000);
    send(`Firewall updated (${(fw || '').trim() || 'unknown'})`);

    send('Verifying service status...');
    const { stdout: pidCheck } = await sshExecSafe('pgrep -f pmtad || echo "not running"');
    send(`PowerMTA daemon PID: ${pidCheck.trim()}`);

    const { stdout: portCheck } = await sshExecSafe(`ss -tlnp | grep -E ':(${config.smtp_port}|${config.monitor_port})' || echo "Ports not yet bound"`);
    send(`Port binding check: ${portCheck.trim() || `SMTP:${config.smtp_port} & Monitor:${config.monitor_port}`}`);

    send('Updating database with installation status...');
    await query("UPDATE pmta_configs SET status = 'installed', installed_at = NOW(), dkim_public_key = $1 WHERE id = $2", [pubKey, config.id]);

    send('✅ PowerMTA installation completed successfully!');
    send('📋 Next steps: Configure your DNS records (SPF, DKIM, DMARC, PTR) before sending.');

  } catch (err) {
    send(`❌ Error: ${err.message}`);
    logger.error('PMTA install error:', err);
  }

  res.end();
});

// POST /pmta/uninstall
router.post('/uninstall', authenticate, authorize('admin'), async (req, res) => {
  const conn = sshSessions.get(req.user.id);
  if (!conn) return res.status(400).json({ error: 'No SSH session' });

  try {
    await sshExec(conn, 'systemctl stop pmta 2>/dev/null || true');
    await sshExec(conn, 'apt-get remove -y pmta 2>/dev/null || rpm -e pmta 2>/dev/null || true');
    await sshExec(conn, 'rm -rf /etc/pmta');
    res.json({ success: true, message: 'PowerMTA uninstalled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /pmta/load-config — load config from remote server
router.post('/load-config', authenticate, authorize('admin'), async (req, res) => {
  const conn = sshSessions.get(req.user.id);
  if (!conn) return res.status(400).json({ error: 'No SSH session' });
  try {
    const { stdout } = await sshExec(conn, 'cat /etc/pmta/config 2>/dev/null || echo "# No config found"');
    res.json({ config: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
