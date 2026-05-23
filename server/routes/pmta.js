import { Router } from 'express';
import { Client as SSHClient } from 'ssh2';
import { query } from '../config/database.js';
import env from '../config/env.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { emitToUser } from '../socket/index.js';
import crypto from 'crypto';
import forge from 'node-forge';
import logger from '../utils/logger.js';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const router = Router();

const SSH_SESSION_TIMEOUT = 30 * 60 * 1000;
const sshSessions = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

const sshRateLimit = new Map();
const SSH_RATE_LIMIT_WINDOW = 60000;
const SSH_RATE_LIMIT_MAX = 10;

function checkSshRateLimit(userId) {
  const now = Date.now();
  const record = sshRateLimit.get(userId) || { count: 0, windowStart: now };
  
  if (now - record.windowStart > SSH_RATE_LIMIT_WINDOW) {
    record.count = 0;
    record.windowStart = now;
  }
  
  record.count++;
  sshRateLimit.set(userId, record);
  
  return record.count <= SSH_RATE_LIMIT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, record] of sshRateLimit.entries()) {
    if (now - record.windowStart > SSH_RATE_LIMIT_WINDOW * 2) {
      sshRateLimit.delete(userId);
    }
  }
}, 300000);

function cleanupSshSession(userId) {
  const session = sshSessions.get(userId);
  if (session) {
    try {
      session.conn.end();
    } catch {}
    clearTimeout(session.timeout);
    sshSessions.delete(userId);
    logger.debug(`SSH session cleaned up for user ${userId}`);
  }
}

function refreshSshTimeout(userId) {
  const session = sshSessions.get(userId);
  if (session) {
    clearTimeout(session.timeout);
    session.timeout = setTimeout(() => {
      cleanupSshSession(userId);
    }, SSH_SESSION_TIMEOUT);
  }
}

setInterval(() => {
  for (const [userId, session] of sshSessions.entries()) {
    if (Date.now() - session.createdAt > SSH_SESSION_TIMEOUT) {
      cleanupSshSession(userId);
    }
  }
}, 60000);

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

function uploadFileViaSftp(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const readStream = createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath, {
        flags: 'w',
        mode: 0o644
      });

      let finished = false;
      const onError = (streamErr) => {
        if (finished) return;
        finished = true;
        reject(streamErr);
      };

      writeStream.on('close', () => {
        if (finished) return;
        finished = true;
        resolve();
      });

      readStream.on('error', onError);
      writeStream.on('error', onError);

      readStream.pipe(writeStream);
    });
  });
}

async function uploadDirectoryViaSftp(conn, localDir, remoteDir, send) {
  await sshExec(conn, `mkdir -p "${remoteDir}"`).catch(() => {});
  const entries = fs.readdir(localDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const localPath = path.join(localDir, entry.name);
    const remotePath = `${remoteDir.replace(/\/$/, '')}/${entry.name}`;
    if (entry.isFile()) {
      await uploadFileViaSftp(conn, localPath, remotePath);
    } else if (entry.isDirectory()) {
      await uploadDirectoryViaSftp(conn, localPath, remotePath, send);
    }
  }
}

function downloadFileToPath(url, destPath, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const tmpPath = `${destPath}.partial-${Date.now()}`;

    const request = client.get(url, { timeout: timeoutMs }, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        response.resume();
        fs.rm(tmpPath, { force: true }).catch(() => {});
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(tmpPath);

      const cleanup = (err) => {
        fileStream.destroy();
        fs.rm(tmpPath, { force: true }).catch(() => {});
        reject(err);
      };

      response.on('error', cleanup);
      fileStream.on('error', cleanup);

      fileStream.on('finish', () => {
        fileStream.close(async (closeErr) => {
          if (closeErr) {
            cleanup(closeErr);
            return;
          }
          try {
            await fs.rename(tmpPath, destPath);
            resolve();
          } catch (renameErr) {
            cleanup(renameErr);
          }
        });
      });

      response.pipe(fileStream);
    });

    request.on('timeout', () => {
      request.destroy(new Error('Download timeout'));
    });

    request.on('error', (err) => {
      fs.rm(tmpPath, { force: true }).catch(() => {});
      reject(err);
    });
  });
}

async function ensureLocalPowerMtaZip(send) {
  const zipPath = path.join(projectRoot, 'PowerMTA5.zip');
  try {
    await fs.access(zipPath);
    send?.('PowerMTA5.zip found on master server');
    return { available: true, path: zipPath };
  } catch {}

  if (env.PMTA_ZIP_URL) {
    try {
      await fs.mkdir(path.dirname(zipPath), { recursive: true });
      send?.(`Downloading PowerMTA5.zip from PMTA_ZIP_URL...`);
      await downloadFileToPath(env.PMTA_ZIP_URL, zipPath, 300000);
      send?.('PowerMTA5.zip downloaded and cached');
      return { available: true, path: zipPath };
    } catch (err) {
      send?.(`PMTA_ZIP_URL download failed: ${err.message}`);
    }
  }

  send?.('PowerMTA5.zip not found. Will upload individual files instead.');
  return { available: false, path: zipPath };
}

router.post('/test-ssh', authenticate, authorize('admin'), async (req, res) => {
  if (!checkSshRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Too many SSH connection attempts. Please wait a minute.' });
  }

  const { host, port, username, password, privateKey, useLocalServer } = req.body;
  if (useLocalServer) return res.json({ success: true, message: 'Local server mode — no SSH needed' });
  if (!host) return res.status(400).json({ error: 'SSH host required' });

  const sanitizedHost = host.replace(/[^\w.-]/g, '');
  const sanitizedPort = Math.min(Math.max(parseInt(port) || 22, 1), 65535);
  const sanitizedUsername = (username || 'root').replace(/[^\w.-]/g, '');

  cleanupSshSession(req.user.id);

  const conn = new SSHClient();
  const timeout = setTimeout(() => {
    conn.end();
    res.status(408).json({ error: 'Connection timeout' });
  }, 15000);

  conn.on('ready', async () => {
    clearTimeout(timeout);
    try {
      const { stdout } = await sshExec(conn, 'hostname && uname -r');
      sshSessions.set(req.user.id, {
        conn,
        createdAt: Date.now(),
        timeout: setTimeout(() => cleanupSshSession(req.user.id), SSH_SESSION_TIMEOUT)
      });
      res.json({ success: true, message: `Connected as ${sanitizedUsername} to ${sanitizedHost}:${sanitizedPort}`, details: stdout.trim() });
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

  conn.on('close', () => {
    cleanupSshSession(req.user.id);
  });

  const connOpts = {
    host: sanitizedHost,
    port: sanitizedPort,
    username: sanitizedUsername,
    readyTimeout: 12000,
    keepaliveInterval: 30000,
    keepaliveCountMax: 3
  };
  if (privateKey && typeof privateKey === 'string') {
    connOpts.privateKey = privateKey.substring(0, 10000);
  } else if (password && typeof password === 'string') {
    connOpts.password = password.substring(0, 256);
  }
  conn.connect(connOpts);
});

router.post('/config', authenticate, authorize('admin'), validate(schemas.pmtaConfig), async (req, res) => {
  const d = req.validated;
  const smtpPassEncrypted = d.smtp_pass ? encrypt(d.smtp_pass) : null;
  const sshPassEncrypted = d.ssh_password ? encrypt(d.ssh_password) : null;
  const sshKeyEncrypted = d.ssh_private_key ? encrypt(d.ssh_private_key) : null;

  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
  const publicKeyBase64 = publicKeyPem.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\n/g, '');

  const { rows } = await query(
    `INSERT INTO pmta_configs (user_id, server_name, ssh_host, ssh_port, ssh_user, domain, hostname,
       primary_ip, secondary_ips, dkim_selector, dkim_private_key, dkim_public_key,
       smtp_user, smtp_pass_encrypted, smtp_port, monitor_port, config_text, isp_rules,
       ssh_pass_encrypted, ssh_key_encrypted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
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
       ssh_pass_encrypted = EXCLUDED.ssh_pass_encrypted,
       ssh_key_encrypted = EXCLUDED.ssh_key_encrypted,
       updated_at = NOW()
     RETURNING *`,
    [req.user.id, d.server_name || 'Default', d.ssh_host, d.ssh_port, d.ssh_user,
     d.domain, d.hostname || d.domain, d.primary_ip, d.secondary_ips || '',
     d.dkim_selector, privateKeyPem, publicKeyBase64,
     d.smtp_user || '', smtpPassEncrypted, d.smtp_port, d.monitor_port,
     d.config_text || '', JSON.stringify(d.isp_rules || []),
     sshPassEncrypted, sshKeyEncrypted]
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

router.post('/service/:action', authenticate, authorize('admin'), async (req, res) => {
  const { action } = req.params;
  const validActions = ['status', 'start', 'stop', 'restart', 'reload'];
  if (!validActions.includes(action)) return res.status(400).json({ error: 'Invalid action' });

  const session = sshSessions.get(req.user.id);
  if (!session) return res.status(400).json({ error: 'No active SSH session. Connect first.' });

  refreshSshTimeout(req.user.id);
  const conn = session.conn;

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

router.post('/install', authenticate, authorize('admin'), async (req, res) => {
  const { rows } = await query('SELECT * FROM pmta_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [req.user.id]);
  if (rows.length === 0) return res.status(400).json({ error: 'No PMTA config saved. Complete Step 2 first.' });
  const config = rows[0];

  if (!config.ssh_host) {
    return res.status(400).json({ error: 'SSH host not configured. Save config first.' });
  }

  if (!config.ssh_pass_encrypted && !config.ssh_key_encrypted) {
    return res.status(400).json({ error: 'SSH credentials not saved. Re-connect and save config with password.' });
  }

  res.json({ message: 'Installation started. Watch progress via live events.' });

  const send = (payload) => {
    const body = (typeof payload === 'string') ? { message: payload } : (payload || {});
    logger.debug(`PMTA progress to user ${req.user.id}: ${(body.message || '').substring(0, 200)}`);
    emitToUser(req.user.id, 'pmta:progress', { ...body });
  };

  const conn = new SSHClient();
  let sshConnected = false;

  const sshExecSafe = async (cmd, timeout = 60000) => {
    return new Promise((resolve, reject) => {
      let streamRef = null;
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        try { streamRef?.close?.(); } catch {}
        try { streamRef?.end?.(); } catch {}
        reject(new Error(`Command timeout: ${cmd.substring(0, 50)}...`));
      }, timeout);
      conn.exec(cmd, (err, stream) => {
        streamRef = stream;
        if (err) { clearTimeout(timer); finished = true; return reject(err); }
        let stdout = '', stderr = '';
        stream.on('close', (code) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, code });
        });
        stream.on('data', (d) => { stdout += d.toString(); });
        stream.stderr.on('data', (d) => { stderr += d.toString(); });
      });
    });
  };

  const connectSsh = () => {
    return new Promise((resolve, reject) => {
      const sanitizedHost = config.ssh_host.replace(/[^\w.-]/g, '');
      const sanitizedPort = Math.min(Math.max(config.ssh_port || 22, 1), 65535);
      const sanitizedUsername = (config.ssh_user || 'root').replace(/[^\w.-]/g, '');

      const connOpts = {
        host: sanitizedHost,
        port: sanitizedPort,
        username: sanitizedUsername,
        readyTimeout: 30000,
        keepaliveInterval: 30000,
        keepaliveCountMax: 3
      };

      if (config.ssh_key_encrypted) {
        try {
          connOpts.privateKey = decrypt(config.ssh_key_encrypted);
        } catch {}
      }
      if (config.ssh_pass_encrypted) {
        try {
          connOpts.password = decrypt(config.ssh_pass_encrypted);
        } catch {}
      }

      conn.on('ready', () => {
        sshConnected = true;
        resolve();
      });

      conn.on('error', (err) => {
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      conn.connect(connOpts);
    });
  };

  try {
    send('Connecting to target VPS via SSH...');
    await connectSsh();
    send(`Connected to ${config.ssh_host}`);

    const monitorPort = Number(config.monitor_port || 1983);
    const smtpPort = Number(config.smtp_port || 2525);
    let pubKey = '';
    let rollbackNeeded = false;

    const rollback = async () => {
      send('Rolling back installation...');
      await sshExecSafe('pkill -f pmtad 2>/dev/null || true').catch(() => {});
      await sshExecSafe('pkill -f pmtahttpd 2>/dev/null || true').catch(() => {});
      await sshExecSafe('rm -rf /etc/pmta /var/spool/pmta').catch(() => {});
      await sshExecSafe('rm -f /usr/sbin/pmtad /usr/sbin/pmtahttpd').catch(() => {});
      await sshExecSafe('iptables -D INPUT -p tcp --dport ' + monitorPort + ' -j ACCEPT 2>/dev/null || true').catch(() => {});
      send('Rollback complete — system returned to pre-install state');
    };

    try {
      send('Detecting operating system...');
      const { stdout: osInfo } = await sshExecSafe('cat /etc/os-release | head -10 && uname -m', 15000);
      send(`OS: ${osInfo.trim().split('\n')[0]}`);
      const isDebian = /ubuntu|debian/i.test(osInfo);
      const isRhel = /almalinux|rocky|centos|rhel|red hat/i.test(osInfo);
      if (!isDebian && !isRhel) {
        send('⚠️ Warning: Unknown OS. Attempting RPM installation as fallback.');
      }

      send('Checking /root/pmta_files/ on target system...');
      const { stdout: dirCheck } = await sshExecSafe('ls -A /root/pmta_files/ 2>&1 || echo DIRECTORY_NOT_FOUND', 10000);
      const targetEmpty = !dirCheck.includes('pmta') && !dirCheck.includes('PowerMTA');
      if (dirCheck.includes('DIRECTORY_NOT_FOUND') || dirCheck.includes('No such file') || targetEmpty) {
        send('/root/pmta_files/ missing or empty on target. Uploading from master server...');
        await sshExecSafe('mkdir -p /root/pmta_files').catch(() => {});
        let uploaded = false;
        try {
          const masterDir = '/root/pmta_files/';
          await fs.access(masterDir).catch(() => { throw new Error('Master /root/pmta_files/ not found'); });
          const entries = await fs.readdir(masterDir, { withFileTypes: true });
          if (entries.length === 0) throw new Error('Master /root/pmta_files/ is empty');
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const localPath = path.join(masterDir, entry.name);
            const remotePath = `/root/pmta_files/${entry.name}`;
            if (entry.isFile()) {
              send(`Uploading ${entry.name}...`);
              await uploadFileViaSftp(conn, localPath, remotePath);
            } else if (entry.isDirectory()) {
              await uploadDirectoryViaSftp(conn, localPath, remotePath, send);
            }
          }
          uploaded = true;
        } catch (err) {
          send(`Upload failed: ${err.message}`);
          const zipPath = path.join(projectRoot, 'PowerMTA5.zip');
          try {
            await fs.access(zipPath);
            send('Falling back to zip upload and extraction...');
            await sshExecSafe('rm -f /root/PowerMTA5.zip').catch(() => {});
            await uploadFileViaSftp(conn, zipPath, '/root/PowerMTA5.zip');
            await sshExecSafe('mkdir -p /root/pmta_files && cd /root/pmta_files && unzip -o /root/PowerMTA5.zip 2>/dev/null || (command -v bsdtar >/dev/null 2>&1 && bsdtar -xf /root/PowerMTA5.zip -C /root/pmta_files)', 180000);
            uploaded = true;
          } catch {}
        }
        if (!uploaded) throw new Error('No PowerMTA files found on master server to upload.');
        send('Files uploaded to /root/pmta_files/');
      } else {
        send('Files found on target');
      }

      send('Verifying binary checksums...');
      const { stdout: pmtadSha } = await sshExecSafe('sha256sum /root/pmta_files/pmtad 2>/dev/null || echo NO_BINARY', 10000);
      const { stdout: httpdSha } = await sshExecSafe('sha256sum /root/pmta_files/pmtahttpd 2>/dev/null || echo NO_BINARY', 10000);
      if (pmtadSha.includes('NO_BINARY') || httpdSha.includes('NO_BINARY')) {
        send('⚠️  Binary checksum files not found — proceeding without hash verification.');
      } else {
        send(`pmtad: ${pmtadSha.split(' ')[0]}`);
        send(`pmtahttpd: ${httpdSha.split(' ')[0]}`);
      }

      send('Installing system dependencies...');
if (isDebian && hasDeb) {
        await sshExecSafe('cd /root/pmta_files && dpkg -i *.deb 2>&1 || (apt-get install -f -y && dpkg -i *.deb 2>&1) || true', 180000);
        send('Debian package installed');
      } else if (hasRpm) {
        await sshExecSafe('cd /root/pmta_files && rpm -ivh *.rpm 2>&1 || true', 180000);
        send('RPM package installed');
      } else if (isDebian) {
        send('⚠️ No .deb found on Ubuntu. Attempting RPM anyway...');
        await sshExecSafe('cd /root/pmta_files && rpm -ivh *.rpm 2>&1 || true', 180000);
      } else {
        send('⚠️ No .rpm found. Attempting dpkg as fallback...');
        await sshExecSafe('cd /root/pmta_files && dpkg -i *.deb 2>&1 || true', 180000);
      }
      send('Dependencies installed');

      send('Stopping existing PowerMTA services...');
      await sshExecSafe('pkill -f pmtad 2>/dev/null || true').catch(() => {});
      await sshExecSafe('pkill -f pmtahttpd 2>/dev/null || true').catch(() => {});
      await sshExecSafe('systemctl stop pmta 2>/dev/null || service pmta stop 2>/dev/null || true').catch(() => {});
      send('Services stopped');

      send('Creating directories...');
      await sshExecSafe('mkdir -p /etc/pmta /var/spool/pmta /var/log/pmta').catch(() => {});
      send('Directories created');

      send('Listing /root/pmta_files/ contents...');
      const { stdout: fileList } = await sshExecSafe('ls -la /root/pmta_files/', 10000);
      send(fileList.substring(0, 400));

      const hasDeb = fileList.includes('.deb');
      const hasRpm = fileList.includes('.rpm');

      send('Installing PowerMTA package(s)...');
      if (isDebian && hasDeb) {
        const { stdout: debFiles } = await sshExecSafe('ls /root/pmta_files/*.deb 2>/dev/null || echo NO_DEB', 10000);
        if (debFiles.includes('NO_DEB')) {
          send('No .deb found, falling back to RPM.');
          await sshExecSafe('cd /root/pmta_files && rpm -ivh *.rpm 2>&1 || true', 180000);
        } else {
          await sshExecSafe('cd /root/pmta_files && dpkg -i *.deb 2>&1 || (apt-get install -f -y && dpkg -i *.deb 2>&1) || true', 180000);
        }
      } else {
        await sshExecSafe('cd /root/pmta_files && rpm -ivh *.rpm 2>&1 || true', 180000);
      }
      send('Package install complete');
      rollbackNeeded = true;

      send('Copying binaries from /root/pmta_files/...');
      await sshExecSafe('cp -f /root/pmta_files/pmtad /usr/sbin/pmtad 2>/dev/null || true').catch(() => {});
      await sshExecSafe('cp -f /root/pmta_files/pmtahttpd /usr/sbin/pmtahttpd 2>/dev/null || true').catch(() => {});
      await sshExecSafe('chmod 755 /usr/sbin/pmtad /usr/sbin/pmtahttpd').catch(() => {});
      send('Binaries installed');

      send('Generating DKIM keypair...');
      await sshExecSafe('mkdir -p /etc/pmta && openssl genrsa -out /etc/pmta/dkim.pem 2048 2>&1', 30000).catch(() => {});
      await sshExecSafe('chmod 600 /etc/pmta/dkim.pem').catch(() => {});
      const { stdout: dkimPub } = await sshExecSafe('openssl rsa -in /etc/pmta/dkim.pem -pubout 2>/dev/null | grep -v "---" | tr -d "\\n"', 10000);
      pubKey = dkimPub.trim();
      send(`DKIM key generated`);

      send('Writing PowerMTA configuration...');
      let configText = config.config_text || '';
      configText = configText.replace(/\{\{\s*domain\s*\}\}/g, config.domain);
      configText = configText.replace(/\{\{\s*hostname\s*\}\}/g, config.hostname || config.domain);
      configText = configText.replace(/\{\{\s*primary_ip\s*\}\}/g, config.primary_ip);
      configText = configText.replace(/\{\{\s*PRIMARY_IP\s*\}\}/g, config.primary_ip);
      configText = configText.replace(/\{\{\s*ip\s*\}\}/g, config.primary_ip);
      configText = configText.replace(/\{\{\s*smtp_user\s*\}\}/g, config.smtp_user || '');
      configText = configText.replace(/\{\{\s*SMTP_USERNAME\s*\}\}/g, config.smtp_user || '');
      configText = configText.replace(/\{\{\s*smtp_pass\s*\}\}/g, config.smtp_pass_encrypted ? decrypt(config.smtp_pass_encrypted) : '');
      configText = configText.replace(/\{\{\s*SMTP_PASSWORD\s*\}\}/g, config.smtp_pass_encrypted ? decrypt(config.smtp_pass_encrypted) : '');
      configText = configText.replace(/\{\{\s*smtp_port\s*\}\}/g, String(smtpPort));
      configText = configText.replace(/\{\{\s*dkim_selector\s*\}\}/g, config.dkim_selector || 'dkim');
      configText = configText.replace(/\{\{\s*monitor_port\s*\}\}/g, String(monitorPort));
      configText = configText.replace('{{ SECONDARY_VMTA_BLOCKS }}', '');
      configText = configText.replace('{{ SECONDARY_VMTA_POOL_ENTRIES }}', '');

      if (config.secondary_ips) {
        const secIps = config.secondary_ips.split('\n').map(i => i.trim()).filter(Boolean);
        let vmtaBlocks = '';
        let poolEntries = '';
        secIps.forEach((ip, idx) => {
          const name = `vmta${idx + 1}`;
          vmtaBlocks += `\n<virtual-mta ${name}>\n    smtp-source-ip ${ip}\n</virtual-mta>\n`;
          poolEntries += `    add-vmta ${name}\n`;
        });
        configText += vmtaBlocks;
        if (poolEntries) configText += `\n<virtual-mta-pool pool>\n${poolEntries}</virtual-mta-pool>\n`;
      }

      await sshExecSafe(`cat > /etc/pmta/config << 'CONFIGEOF'\n${configText}\nCONFIGEOF`).catch(() => {});
      await sshExecSafe('chmod 600 /etc/pmta/config /etc/pmta/license 2>/dev/null || chmod 600 /etc/pmta/config').catch(() => {});
      send('Configuration written to /etc/pmta/config');

      send('Starting PowerMTA daemon...');
      await sshExecSafe('/usr/sbin/pmtad 2>&1 &', 15000).catch(() => {});
      await sshExecSafe('nohup /usr/sbin/pmtahttpd >/dev/null 2>&1 &', 10000).catch(() => {});
      send('PowerMTA services started');

      send('Configuring firewall...');
      const fwCmd = `iptables -A INPUT -p tcp --dport ${monitorPort} -j ACCEPT`;
      await sshExecSafe(fwCmd, 10000).catch(() => {});
      send(`Firewall rule added for port ${monitorPort}`);

      send('Verifying service status...');
      const { stdout: pidCheck } = await sshExecSafe('pgrep -f pmtad || echo "not running"', 10000);
      send(`PowerMTA daemon PID: ${pidCheck.trim()}`);

      send('Checking port bindings...');
      const portCheckCmd = `
T=""
command -v timeout >/dev/null 2>&1 && T="timeout 8"
if command -v ss >/dev/null 2>&1; then $T ss -tlnp 2>/dev/null; elif command -v netstat >/dev/null 2>&1; then $T netstat -tlnp 2>/dev/null; else echo "no-port-tool"; fi | grep -E ':(${smtpPort}|${monitorPort})' || echo "Ports not yet bound"
`.trim().replace(/\n/g, '; ');
      const { stdout: portCheck } = await sshExecSafe(portCheckCmd, 15000);
      send(`Port binding: ${(portCheck || '').trim() || `SMTP:${smtpPort} & Monitor:${monitorPort}`}`);

      send('Updating database...');
      await query("UPDATE pmta_configs SET status = 'installed', installed_at = NOW(), dkim_public_key = $1 WHERE id = $2", [pubKey || '', config.id]);

      send({ message: 'PowerMTA installation completed successfully!', success: true, done: true });
      send({ message: 'Next steps: Configure your DNS records (SPF, DKIM, DMARC, PTR) before sending.', success: true });

    } catch (installErr) {
      if (rollbackNeeded) await rollback();
      throw installErr;
    }

  } catch (err) {
    send({ message: `Error: ${err.message}`, success: false, done: true });
    logger.error('PMTA install error:', err);
  } finally {
    if (sshConnected) {
      try { conn.end(); } catch {}
    }
  }
});

router.post('/uninstall', authenticate, authorize('admin'), async (req, res) => {
  const session = sshSessions.get(req.user.id);
  if (!session) return res.status(400).json({ error: 'No SSH session' });

  refreshSshTimeout(req.user.id);
  const conn = session.conn;

  try {
    await sshExec(conn, 'systemctl stop pmta 2>/dev/null || true');
    await sshExec(conn, 'apt-get remove -y pmta 2>/dev/null || rpm -e pmta 2>/dev/null || true');
    await sshExec(conn, 'rm -rf /etc/pmta');
    res.json({ success: true, message: 'PowerMTA uninstalled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/load-config', authenticate, authorize('admin'), async (req, res) => {
  const session = sshSessions.get(req.user.id);
  if (!session) return res.status(400).json({ error: 'No SSH session' });

  refreshSshTimeout(req.user.id);
  const conn = session.conn;

  try {
    const { stdout } = await sshExec(conn, 'cat /etc/pmta/config 2>/dev/null || echo "# No config found"');
    res.json({ config: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
