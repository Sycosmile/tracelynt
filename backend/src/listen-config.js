export function getListenHost(env = process.env) {
  // Render's public web-service proxy must be able to reach the process.
  // Keep local development loopback-only unless explicitly configured.
  if (env.RENDER === 'true') return '0.0.0.0';
  return env.HOST || '127.0.0.1';
}
