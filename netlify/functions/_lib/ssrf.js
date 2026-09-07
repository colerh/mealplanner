// Guards against server-side request forgery in fetch-page.js: only plain
// http/https URLs pointing at public hostnames/IPs are allowed.
const dns = require('dns').promises;
const net = require('net');

function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
    return false;
  }
  return true;
}

async function assertPublicHttpUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Invalid URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http/https URLs are allowed.');
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '0.0.0.0') {
    throw new Error('Refusing to fetch a local/internal address.');
  }
  let addresses;
  try { addresses = await dns.lookup(hostname, { all: true }); } catch { throw new Error('Could not resolve host.'); }
  if (addresses.some(a => isPrivateIp(a.address))) throw new Error('Refusing to fetch a private/internal address.');
  return parsed;
}

module.exports = { assertPublicHttpUrl, isPrivateIp };
