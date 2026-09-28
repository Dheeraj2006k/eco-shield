import { NextResponse } from 'next/server';
import { authSecret, configuredUsers } from '@/lib/auth';

export const runtime = 'nodejs';

/** Deployment self-check. Reports whether required env vars are present — never their values. */
export async function GET() {
  const auth_configured = authSecret() !== null && configuredUsers().length > 0;
  return NextResponse.json(
    {
      status: auth_configured ? 'ok' : 'misconfigured',
      service: 'eco-shield-web',
      mode: 'DEMO / SIMULATED DATA',
      auth_configured,
      users_configured: configuredUsers().length,
      backend_api: process.env.NEXT_PUBLIC_API_URL ? 'configured' : 'not configured (local demo engine only)',
      hint: auth_configured ? undefined : 'Set IRIS_AUTH_SECRET (>= 32 chars) and IRIS_USERS in the environment.',
    },
    { status: auth_configured ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
