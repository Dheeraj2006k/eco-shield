import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@iris/config';
import { authSecret, verifySession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await verifySession(token, authSecret());
  if (!s) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { name: s.name, role: s.role } });
}
