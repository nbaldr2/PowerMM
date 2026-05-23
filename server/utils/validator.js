const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const SELECTOR_RE = /^[a-z0-9-]{1,63}$/i;

export function validateDomain(domain) {
  if (!domain) return { valid: false, error: 'Domain is required' };
  const clean = domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(clean)) return { valid: false, error: `Invalid domain format: ${domain}` };
  return { valid: true, domain: clean };
}

export function validateIp(ip) {
  if (!ip) return { valid: false, error: 'IP address is required' };
  const clean = ip.trim();
  if (!IPV4_RE.test(clean)) return { valid: false, error: `Invalid IPv4 address: ${ip}` };
  return { valid: true, ip: clean };
}

export function validateSelector(selector) {
  if (!selector) return { valid: true, selector: 'dkim' };
  const clean = selector.trim().toLowerCase();
  if (!SELECTOR_RE.test(clean)) return { valid: false, error: `Invalid DKIM selector: ${selector}. Use alphanumeric and hyphens only.` };
  return { valid: true, selector: clean };
}

export function normalizeSecondaryIps(input) {
  if (!input || (Array.isArray(input) && input.length === 0)) return [];
  if (Array.isArray(input)) return input.map(i => i.trim()).filter(Boolean);
  return input.split('\n').map(i => i.trim()).filter(Boolean);
}