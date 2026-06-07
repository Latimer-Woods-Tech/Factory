#!/usr/bin/env node
import { createHmac, randomUUID } from 'node:crypto';

const env = process.env.STUDIO_JWT_ENV ?? 'production';
const secret = process.env.JWT_SECRET ?? '';
const subject = process.env.STUDIO_JWT_SUBJECT ?? 'admin-studio-automation@factory.local';
const app = process.env.STUDIO_JWT_APP?.trim() || undefined;
const ttlSeconds = Number.parseInt(process.env.STUDIO_JWT_TTL_SECONDS ?? '', 10) || (env === 'production' ? 4 * 3600 : 24 * 3600);

if (!secret) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}

if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
  console.error('STUDIO_JWT_TTL_SECONDS must be a positive integer');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const exp = now + ttlSeconds;
const payload = {
  iat: now,
  exp,
  iss: 'factory-admin-studio',
  sub: subject,
  env,
  ...(app ? { app } : {}),
  sessionId: randomUUID(),
  userId: subject,
  userEmail: subject,
  role: 'owner',
  envLockedAt: Date.now(),
};

const token = signJwt(payload, secret);
const result = { token, expiresAt: exp * 1000 };

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

process.stdout.write(`${token}\n`);

function signJwt(jwtPayload, jwtSecret) {
  const headerB64 = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const payloadB64 = base64UrlEncode(jwtPayload);
  const data = `${headerB64}.${payloadB64}`;
  const signature = createHmac('sha256', jwtSecret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
