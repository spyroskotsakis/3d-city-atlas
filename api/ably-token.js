import * as Ably from 'ably';
import { randomUUID } from 'node:crypto';

const COOKIE_NAME = 'atlas_live_id';
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;
const tokenRequestCounts = new Map();

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAllowedOrigin(request)) {
    response.status(403).json({ error: 'Origin is not allowed' });
    return;
  }

  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: 'Live presence is not configured' });
    return;
  }

  if (!isRateAllowed(request)) {
    response.status(429).json({ error: 'Too many live presence token requests' });
    return;
  }

  const namespace = getChannelNamespace();
  if (!namespace) {
    response.status(503).json({ error: 'Live presence namespace is not configured' });
    return;
  }

  const ttl = clampNumber(Number(process.env.ABLY_TOKEN_TTL_MS), 5 * 60 * 1000, 2 * 60 * 60 * 1000, DEFAULT_TTL_MS);
  const clientId = getOrCreateClientId(request, response);
  const identity = buildIdentity(clientId);
  const realtime = new Ably.Rest({ key: apiKey });

  try {
    const tokenRequest = await realtime.auth.createTokenRequest({
      clientId,
      ttl,
      capability: {
        [`${namespace}:presence`]: ['subscribe', 'presence'],
        [`${namespace}:city:*:movement`]: ['publish', 'subscribe']
      }
    });

    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({
      tokenRequest,
      client: identity,
      channels: {
        namespace,
        presence: `${namespace}:presence`
      }
    });
  } catch (error) {
    response.status(503).json({ error: 'Could not create live presence token' });
  }
}

function getOrCreateClientId(request, response) {
  const cookies = parseCookies(request.headers.cookie ?? '');
  const existing = sanitizeClientId(cookies[COOKIE_NAME]);
  if (existing) return existing;

  const clientId = `guest-${randomUUID()}`;
  const secureCookie = isSecureRequest(request) ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${clientId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secureCookie}`
  );
  return clientId;
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(';').reduce((cookies, part) => {
    const [name, ...valueParts] = part.trim().split('=');
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

function sanitizeClientId(value) {
  if (typeof value !== 'string') return null;
  return /^guest-[a-f0-9-]{36}$/i.test(value) ? value : null;
}

function buildIdentity(clientId) {
  const seed = hashString(clientId);
  const displayId = String(seed % 100000).padStart(5, '0');
  return {
    clientId,
    displayId,
    name: `Visitor #${displayId}`,
    color: ['#f2c46d', '#74b8c5', '#7f9a72', '#d8cfb7', '#d7b56f', '#51a6b6'][seed % 6]
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getChannelNamespace() {
  const configured = process.env.ABLY_CHANNEL_NAMESPACE;
  if (configured) return cleanNamespace(configured);
  if (!process.env.VERCEL) return 'atlas:preview-live-presence';
  return null;
}

function cleanNamespace(value) {
  const namespace = String(value).trim().replace(/[^a-zA-Z0-9:_-]/g, '-');
  return namespace || null;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return !process.env.VERCEL;

  const secFetchSite = request.headers['sec-fetch-site'];
  if (process.env.VERCEL && secFetchSite && !['same-origin', 'none'].includes(secFetchSite)) return false;

  const allowed = new Set([
    `https://${process.env.VERCEL_URL}`,
    `https://${process.env.VERCEL_BRANCH_URL}`,
    ...(process.env.ATLAS_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  ]);

  if (allowed.has(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'http:' && (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.')
    );
  } catch {
    return false;
  }
}

function isSecureRequest(request) {
  return request.headers['x-forwarded-proto'] === 'https' || request.headers['x-vercel-forwarded-proto'] === 'https';
}

function isRateAllowed(request) {
  const now = Date.now();
  const key = clientIp(request);
  const current = tokenRequestCounts.get(key);
  if (!current || now - current.startedAt > RATE_LIMIT_WINDOW_MS) {
    tokenRequestCounts.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT_MAX;
}

function clientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) return forwardedFor.split(',')[0].trim();
  return request.socket?.remoteAddress ?? 'unknown';
}
