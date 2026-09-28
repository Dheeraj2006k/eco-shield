import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@iris/config';
import { authSecret, signSession, verifySession } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * The session cookie is httpOnly and the API is on another origin, so the browser cannot send it.
 * This mints a short-lived bearer token (same secret, same claims) for calling the FastAPI backend.
 */
export async function GET() {
  const secret = authSecret();
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret);
  if (!s || !secret) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const ttl = 15 * 60;
  const token = await signSession({ sub: s.sub, role: s.role, name: s.name }, secret, ttl);
  return NextResponse.json({ token, expires_in: ttl }, { headers: { 'Cache-Control': 'no-store' } });
}
