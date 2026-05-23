import React, { useState } from 'react';
import api from './api.js';

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.7)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const inputStyle = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '13px',
  color: '#fff',
  fontFamily: 'monospace',
  outline: 'none',
  boxSizing: 'border-box',
};

const hintStyle = {
  fontSize: '10px',
  color: 'rgba(255,255,255,0.35)',
  marginTop: '3px',
};

const tabBtn = (active) => ({
  padding: '8px 16px',
  fontSize: '12px',
  fontWeight: 600,
  border: 'none',
  borderRadius: '8px 8px 0 0',
  cursor: 'pointer',
  background: active ? 'rgba(0,198,255,0.15)' : 'transparent',
  color: active ? '#00c6ff' : 'rgba(255,255,255,0.5)',
  borderBottom: active ? '2px solid #00c6ff' : '2px solid transparent',
  transition: 'all 0.2s',
});

const badgeColors = {
  DKIM: '#f59e0b',
  SPF: '#10b981',
  DMARC: '#ef4444',
  PTR: '#3b82f6',
  A: '#3b82f6',
  MX: '#3b82f6',
};

export default function DnsGenerator({ onClose }) {
  const [form, setForm] = useState({
    sendingDomain: '',
    hostname: '',
    primaryIP: '',
    dkimSelector: 'dkim',
    secondaryIPs: '',
    postmaster: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('dns');
  const [copied, setCopied] = useState(null);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const copyToClipboard = (text, label) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, 99999);
    document.execCommand('copy');
    document.body.removeChild(ta);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const recordsRow = (label, name, value, badge) => (
    <div key={label} style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{
        background: badgeColors[badge] || '#6b7280',
        color: '#000',
        fontSize: '9px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '4px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        marginTop: '2px',
      }}>{badge}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px', fontFamily: 'monospace' }}>{name}</div>
        <div style={{
          fontSize: '11px',
          color: '#fff',
          fontFamily: 'monospace',
          wordBreak: 'break-all',
          lineHeight: 1.5,
          background: 'rgba(0,0,0,0.2)',
          padding: '6px 8px',
          borderRadius: '4px',
        }}>{value}</div>
      </div>
      <button
        onClick={() => copyToClipboard(`${name} IN ${badge === 'PTR' ? 'PTR' : badge === 'A' ? 'A' : badge === 'MX' ? 'MX' : 'TXT'} "${value}"`, label)}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          color: copied === label ? '#10b981' : 'rgba(255,255,255,0.6)',
          cursor: 'pointer',
          padding: '6px 10px',
          fontSize: '11px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >{copied === label ? '✓ Copied' : 'Copy'}</button>
    </div>
  );

  const generate = async () => {
    if (!form.sendingDomain || !form.primaryIP) {
      alert('Sending Domain and Primary IP are required');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await api.request('/api/dns/generate', {
        method: 'POST',
        body: {
          sendingDomain: form.sendingDomain,
          hostname: form.hostname || `mail.${form.sendingDomain}`,
          primaryIP: form.primaryIP,
          dkimSelector: form.dkimSelector || 'dkim',
          secondaryIPs: form.secondaryIPs,
          postmaster: form.postmaster || `postmaster@${form.sendingDomain}`,
        },
      });
      setResult(data);
    } catch (err) {
      alert('Generation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    background: '#0f1318',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '24px',
    maxWidth: '900px',
    width: '100%',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#fff',
  };

  return (
    <div style={containerStyle}>
      {onClose && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>DNS & DKIM Generator</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', cursor: 'pointer', padding: '6px 12px', fontSize: '12px' }}>Close</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>Sending Domain *</label>
          <input style={inputStyle} value={form.sendingDomain} onChange={update('sendingDomain')} placeholder="example.com" />
          <div style={hintStyle}>The domain emails will be sent from</div>
        </div>
        <div>
          <label style={labelStyle}>Hostname</label>
          <input style={inputStyle} value={form.hostname} onChange={update('hostname')} placeholder={`mail.${form.sendingDomain || 'example.com'}`} />
          <div style={hintStyle}>HELO/EHLO hostname — defaults to mail.{'{domain}'}</div>
        </div>
        <div>
          <label style={labelStyle}>Primary IP *</label>
          <input style={inputStyle} value={form.primaryIP} onChange={update('primaryIP')} placeholder="192.0.2.1" />
          <div style={hintStyle}>Main IP address for outbound email</div>
        </div>
        <div>
          <label style={labelStyle}>DKIM Selector</label>
          <input style={inputStyle} value={form.dkimSelector} onChange={update('dkimSelector')} placeholder="dkim" />
          <div style={hintStyle}>Usually "dkim" or "default"</div>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Secondary IPs</label>
        <textarea
          style={{ ...inputStyle, resize: 'vertical', minHeight: '60px', fontFamily: 'monospace' }}
          value={form.secondaryIPs}
          onChange={update('secondaryIPs')}
          placeholder={`203.0.113.1\n198.51.100.1`}
        />
        <div style={hintStyle}>Leave empty for single-IP mode. Adding IPs creates automatic VMTA rotation pools.</div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Postmaster Email</label>
        <input style={inputStyle} value={form.postmaster} onChange={update('postmaster')} placeholder={`postmaster@${form.sendingDomain || 'example.com'}`} />
        <div style={hintStyle}>Used for DMARC rua reports</div>
      </div>

      <button
        onClick={generate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          background: loading ? 'rgba(0,198,255,0.3)' : 'linear-gradient(135deg, #00c6ff, #0072ff)',
          border: 'none',
          borderRadius: '10px',
          color: '#fff',
          fontSize: '14px',
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '20px',
        }}
      >{loading ? 'Generating DKIM keys…' : 'Generate DNS Records'}</button>

      {result && (
        <>
          <div style={{
            display: 'flex',
            gap: '4px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginBottom: '16px',
          }}>
            <button style={tabBtn(tab === 'dns')} onClick={() => setTab('dns')}>DNS Records</button>
            <button style={tabBtn(tab === 'key')} onClick={() => setTab('key')}>DKIM Private Key</button>
            <button style={tabBtn(tab === 'config')} onClick={() => setTab('config')}>PMTA Config</button>
          </div>

          {tab === 'dns' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'dkim', badge: 'DKIM', name: `${result.dkim.selector}._domainkey.${result.records.dkim.name.split('.').slice(1).join('.')}`,
                  value: result.records.dkim.value },
                { label: 'spf', badge: 'SPF', name: result.records.spf.name,
                  value: result.records.spf.value },
                { label: 'dmarc', badge: 'DMARC', name: result.records.dmarc.name,
                  value: result.records.dmarc.value },
                { label: 'ptr', badge: 'PTR', name: result.records.ptr.name,
                  value: result.records.ptr.value },
                { label: 'a', badge: 'A', name: result.records.a.name,
                  value: result.records.a.value },
                { label: 'mx', badge: 'MX', name: result.records.mx.name,
                  value: result.records.mx.value },
              ].map(r => recordsRow(r.label, r.name, r.value, r.badge))}
            </div>
          )}

          {tab === 'key' && (
            <div>
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#ef4444',
                marginBottom: '12px',
              }}>
                ⚠ Save this key now. It is not stored on the server.
              </div>
              <pre style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '11px',
                color: '#f59e0b',
                fontFamily: 'monospace',
                maxHeight: '300px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>{result.dkim.privateKeyPem}</pre>
              <button
                onClick={() => copyToClipboard(result.dkim.privateKeyPem, 'pkey')}
                style={{
                  marginTop: '10px',
                  padding: '8px 16px',
                  background: copied === 'pkey' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: copied === 'pkey' ? '#10b981' : '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >{copied === 'pkey' ? '✓ Copied' : 'Copy key'}</button>
            </div>
          )}

          {tab === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: '8px' }}>DKIM Sign Config</div>
                <pre style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  padding: '14px',
                  fontSize: '11px',
                  color: '#00c6ff',
                  fontFamily: 'monospace',
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>{result.config.dkim}</pre>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: '8px' }}>Virtual MTA Blocks</div>
                <pre style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  padding: '14px',
                  fontSize: '11px',
                  color: '#10b981',
                  fontFamily: 'monospace',
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>{result.config.vmtas}</pre>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: '8px' }}>Virtual MTA Pool</div>
                <pre style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  padding: '14px',
                  fontSize: '11px',
                  color: '#a78bfa',
                  fontFamily: 'monospace',
                  maxHeight: '150px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>{result.config.pool}</pre>
              </div>
            </div>
          )}

          <div style={{
            marginTop: '16px',
            padding: '10px 14px',
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'monospace',
          }}>
            <span>Generated at {new Date(result.generatedAt).toLocaleString()}</span>
            <span>Request ID: {result.requestId.substring(0, 8)}</span>
          </div>
        </>
      )}
    </div>
  );
}