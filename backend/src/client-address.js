import { isIP } from 'node:net';

// Render routes public web-service traffic through Cloudflare. Cloudflare's
// CF-Connecting-IP is a single client address set at its edge; X-Forwarded-For
// can contain client-supplied proxy-chain values and is deliberately ignored.
export function getClientAddress(request, env = process.env) {
  if (env.RENDER === 'true') {
    const value = request?.headers?.['cf-connecting-ip'];
    if (typeof value !== 'string') return 'unknown';
    const address = value.trim();
    if (!address || address.length > 45 || isIP(address) === 0) return 'unknown';
    return address.toLowerCase();
  }

  const address = request?.socket?.remoteAddress;
  if (typeof address !== 'string' || address.length > 45 || isIP(address) === 0) return 'unknown';
  return address.toLowerCase();
}
