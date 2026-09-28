/**
 * Minimal HS256 JWT helpers built on Web Crypto so they run in both the Edge
 * middleware and Node route handlers. The FastAPI backend verifies the same
 * token with the same IRIS_AUTH_SECRET.
 */
import type { Role } from '@iris/types';

export interface Session {
  sub: string;
  role: Role;
  name: string;
  iat: number;
  exp: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export function authSecret(): string | null {
  const s = process.env.IRIS_AUTH_SECRET;
  return s && s.length >= 32 ? s : null;
}

export async function signSession(user: { sub: string; role: Role; name: string }, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(enc.encode(JSON.stringify({ ...user, iat: now, exp: now + SESSION_TTL_SECONDS })));
  const data = `${header}.${payload}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
  return `${data}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null, secret: string | null): Promise<Session | null> {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(parts[2]) as BufferSource, enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(parts[1]))) as Session;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface ConfiguredUser {
  username: string;
  role: Role;
  password: string;
}

/** IRIS_USERS="admin|ADMIN|secret,operator|OPERATOR|secret". Never hard-coded; see .env.example. */
export function configuredUsers(): ConfiguredUser[] {
  const raw = process.env.IRIS_USERS ?? '';
  const roles: Role[] = ['ADMIN', 'AUTHORITY', 'OPERATOR', 'FIELD_STEWARD', 'VIEWER'];
  return raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [username, role, ...rest] = chunk.split('|');
      return { username, role: role as Role, password: rest.join('|') };
    })
    .filter((u) => u.username && u.password && roles.includes(u.role));
}
