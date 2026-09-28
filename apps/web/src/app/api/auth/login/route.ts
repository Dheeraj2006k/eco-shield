import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@iris/config';
import { SESSION_TTL_SECONDS, authSecret, configuredUsers, signSession } from '@/lib/auth';

export const runtime = 'nodejs';

// Tiny in-memory throttle: 8 attempts / minute / client. Replace with Redis in production.
const attempts = new Map<string, { n: number; reset: number }>();

function digest(s: string) {
  return createHash('sha256').update(s).digest();
}

export async function POST(req: Request) {
  const secret = authSecret();
  const users = configuredUsers();
  if (!secret || users.length === 0) {
    return NextResponse.json(
      { error: 'Server is not configured. Set IRIS_AUTH_SECRET (≥32 chars) and IRIS_USERS — run `npm run gen-env`.' },
      { status: 503 },
    );
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && rec.reset > now && rec.n >= 8) {
    return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }
  attempts.set(ip, rec && rec.reset > now ? { n: rec.n + 1, reset: rec.reset } : { n: 1, reset: now + 60_000 });

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 64) : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 256) : '';
  if (!username || !password) return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });

  const user = users.find((u) => u.username === username);
  // Always run a comparison so response time does not reveal whether the user exists.
  const expected = digest(user?.password ?? 'x'.repeat(16));
  const ok = timingSafeEqual(expected, digest(password)) && !!user;
  if (!ok || !user) return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });

  attempts.delete(ip);
  const token = await signSession({ sub: user.username, role: user.role, name: user.username }, secret);
  const res = NextResponse.json({ user: { name: user.username, role: user.role } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.IRIS_INSECURE_COOKIES !== '1',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
