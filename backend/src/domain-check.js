import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { domainToASCII } from 'node:url';
import { normalizeObservation } from './observation.js';

const RESERVED_SUFFIXES = ['.localhost', '.local', '.internal', '.test', '.invalid', '.example', '.onion'];
const MAX_DOMAIN_LENGTH = 253;

export function normalizeDomain(input) {
  if (typeof input !== 'string') throw new TypeError('Domain must be a string.');
  if (input.length > 1024) throw new Error('Input is too long.');
  let value = input.trim().toLowerCase();
  if (!value || value.length > MAX_DOMAIN_LENGTH + 1) throw new Error('Enter a valid domain name.');
  if (value.endsWith('.')) value = value.slice(0, -1);
  if (value.includes('://') || /[\s/@?#\\]/.test(value) || value.includes(':')) {
    throw new Error('Enter a domain name only, without a URL, path, port, or credentials.');
  }
  const ascii = domainToASCII(value);
  if (!ascii || ascii.length > MAX_DOMAIN_LENGTH || net.isIP(ascii)) throw new Error('Enter a valid domain name, not an IP address.');
  if (!ascii.includes('.') || ascii.startsWith('.') || ascii.endsWith('.')) throw new Error('Enter a fully qualified domain name.');
  const labels = ascii.split('.');
  if (labels.some(label => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error('Domain contains an invalid label.');
  }
  if (RESERVED_SUFFIXES.some(suffix => ascii.endsWith(suffix))) throw new Error('Reserved or local-use domains are not supported.');
  return ascii;
}

function ipv4ToNumber(address) {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((sum, part) => (sum * 256) + Number(part), 0) >>> 0;
}

function inV4Range(ip, base, prefix) {
  const value = ipv4ToNumber(ip);
  const start = ipv4ToNumber(base);
  if (value === null || start === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (start & mask);
}

function parseIPv6(address) {
  let value = address.toLowerCase();
  if (value.includes('%')) return null;
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    if (lastColon < 0) return null;
    const v4 = ipv4ToNumber(value.slice(lastColon + 1));
    if (v4 === null) return null;
    value = value.slice(0, lastColon + 1) + ((v4 >>> 16).toString(16)) + ':' + ((v4 & 0xffff).toString(16));
  }
  if ((value.match(/::/g) || []).length > 1) return null;
  const halves = value.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length > 1 && missing < 1) return null;
  const groups = halves.length > 1 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map(group => parseInt(group, 16));
}

export function isPublicIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const blocked = [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
      ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
      ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24],
      ['192.168.0.0', 16], ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24],
      ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
    ];
    return !blocked.some(([base, prefix]) => inV4Range(address, base, prefix));
  }
  if (version === 6) {
    const groups = parseIPv6(address);
    if (!groups) return false;
    // Only global-unicast space is eligible; conservatively exclude special-use ranges.
    if ((groups[0] & 0xe000) !== 0x2000) return false;
    if (groups[0] === 0x2001 && groups[1] <= 0x01ff) return false;
    if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;
    if (groups[0] === 0x2002) return false;
    if (groups[0] === 0x3fff && groups[1] <= 0x0fff) return false;
    return true;
  }
  return false;
}

async function query(run) {
  try {
    const records = await run();
    return { status: records.length ? 'ok' : 'no_records', records };
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'DNS_ERROR';
    if (code === 'ENODATA') return { status: 'no_records', records: [] };
    if (code === 'ENOTFOUND') return { status: 'error', records: [], error: 'DNS_NAME_NOT_FOUND' };
    return { status: 'error', records: [], error: code };
  }
}

function getTlsCertificate(address, domain, timeoutMs = 4000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const socket = tls.connect({
      host: address,
      port: 443,
      servername: domain,
      rejectUnauthorized: true,
      timeout: timeoutMs
    });
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      finish({
        status: 'ok',
        authorized: socket.authorized,
        protocol: socket.getProtocol(),
        subject: cert?.subject?.CN || null,
        issuer: cert?.issuer?.O || cert?.issuer?.CN || null,
        validFrom: cert?.valid_from || null,
        validTo: cert?.valid_to || null
      });
      socket.end();
    });
    socket.once('timeout', () => {
      socket.destroy();
      finish({ status: 'error', error: 'TLS_TIMEOUT' });
    });
    socket.once('error', error => {
      socket.destroy();
      finish({ status: 'error', error: error?.code || 'TLS_ERROR' });
    });
  });
}

export async function inspectDomain(input, dependencies = {}) {
  const domain = normalizeDomain(input);
  const resolver = dependencies.resolver || dns;
  const tlsCheck = dependencies.tlsCheck || getTlsCertificate;
  const [a, aaaa, mx, txt] = await Promise.all([
    query(() => resolver.resolve4(domain)),
    query(() => resolver.resolve6(domain)),
    query(() => resolver.resolveMx(domain)),
    query(() => resolver.resolveTxt(domain))
  ]);
  const addresses = [...a.records, ...aaaa.records];
  if (addresses.some(address => !isPublicIp(address))) {
    throw new Error('Domain resolves to a non-public or special-use IP address; request blocked.');
  }
  const publicIpv4 = a.records.filter(address => isPublicIp(address));
  const tlsInfo = publicIpv4.length
    ? await tlsCheck(publicIpv4[0], domain)
    : { status: 'skipped', reason: 'No public IPv4 address available for the current TLS check.' };
  const retrievedAt = new Date().toISOString();
  const checks = {
    dns: {
      ipv4: { status: a.status, records: a.records, ...(a.error ? { error: a.error } : {}) },
      ipv6: { status: aaaa.status, records: aaaa.records, ...(aaaa.error ? { error: aaaa.error } : {}) },
      mx: { status: mx.status, records: mx.records.slice(0, 10).map(item => ({ exchange: item.exchange, priority: item.priority })), ...(mx.error ? { error: mx.error } : {}) },
      txt: { status: txt.status, records: txt.records.slice(0, 10).map(parts => parts.join('').slice(0, 512)) }
    },
    tls: tlsInfo
  };
  const limitations = [
    'Results reflect a point-in-time technical observation and may change.',
    'A DNS or TLS result does not establish website legitimacy or the identity of an operator.',
    'TLS is attempted only against a validated public IPv4 address in this initial version.'
  ];
  const observations = Object.entries({
    'DNS IPv4': checks.dns.ipv4,
    'DNS IPv6': checks.dns.ipv6,
    'DNS MX': checks.dns.mx,
    'DNS TXT': checks.dns.txt,
    'TLS certificate': checks.tls
  }).map(([name, result]) => normalizeObservation({
    subject: { type: 'domain', value: domain },
    claim: name + ' check result: ' + JSON.stringify(result),
    category: 'direct_observation',
    source: { name: 'Tracelynt ' + name + ' inspection' },
    retrievedAt,
    reviewState: result.status === 'error' ? 'unavailable' : 'unreviewed',
    freshness: { state: 'unknown' },
    provenance: { kind: 'system' },
    limitations
  }));
  return { domain, retrievedAt, checks, observations, limitations };
}
