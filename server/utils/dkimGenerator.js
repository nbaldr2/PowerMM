import forge from 'node-forge';

export function generateDkimKeypair() {
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
  const publicKeyBase64 = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '');
  return { privateKeyPem, publicKeyBase64 };
}

export function buildDnsRecords({ sendingDomain, hostname, primaryIP, secondaryIPs, dkimSelector, postmaster, dkimPublicKey }) {
  const selector = dkimSelector || 'dkim';
  const host = hostname || `mail.${sendingDomain}`;
  const postmasterEmail = postmaster || `postmaster@${sendingDomain}`;

  const spfIps = [`ip4:${primaryIP}`];
  if (secondaryIPs) {
    const secIps = Array.isArray(secondaryIPs) ? secondaryIPs : secondaryIPs.split('\n').map(i => i.trim()).filter(Boolean);
    secIps.forEach(ip => spfIps.push(`ip4:${ip}`));
  }

  return {
    dkim: {
      type: 'TXT',
      name: `${selector}._domainkey.${sendingDomain}`,
      value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
    },
    spf: {
      type: 'TXT',
      name: sendingDomain,
      value: `v=spf1 ${spfIps.join(' ')} ~all`,
    },
    dmarc: {
      type: 'TXT',
      name: `_dmarc.${sendingDomain}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:${postmasterEmail}`,
    },
    ptr: {
      type: 'PTR',
      name: primaryIP,
      value: host,
    },
    a: {
      type: 'A',
      name: host,
      value: primaryIP,
    },
    mx: {
      type: 'MX',
      name: sendingDomain,
      value: `10 ${host}`,
    },
  };
}

export function buildDkimConfigSnippet(sendingDomain, dkimSelector, privateKeyPem) {
  const selector = dkimSelector || 'dkim';
  return `# DKIM Signing Configuration
domain-key ${sendingDomain}, ${selector}, /etc/pmta/dkim/${selector}.pem

# DKIM private key (save to /etc/pmta/dkim/${selector}.pem)
# --- BEGIN DKIM KEY ---
${privateKeyPem}
# --- END DKIM KEY ---
`;
}

export function buildVmtaBlocks(primaryIP, secondaryIPs) {
  const vmtas = [];
  const poolEntries = [];

  vmtas.push(`<virtual-mta primary>
    smtp-source-ip ${primaryIP}
</virtual-mta>`);
  poolEntries.push('    virtual-mta primary');

  if (secondaryIPs) {
    const secIps = Array.isArray(secondaryIPs) ? secondaryIPs : secondaryIPs.split('\n').map(i => i.trim()).filter(Boolean);
    secIps.forEach((ip, idx) => {
      const name = `vmta${idx + 1}`;
      vmtas.push(`<virtual-mta ${name}>
    smtp-source-ip ${ip}
</virtual-mta>`);
      poolEntries.push(`    add-vmta ${name}`);
    });
  }

  return {
    vmtas: vmtas.join('\n\n'),
    pool: `<virtual-mta-pool default-pool>\n${poolEntries.join('\n')}\n</virtual-mta-pool>`,
  };
}
