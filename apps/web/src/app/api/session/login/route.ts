import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '../../../../lib/auth/cookies';
import { ttlFromToken } from '../../../../lib/auth/session';
import { getGatewayBaseUrl } from '../../../../lib/server/gateway';

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const email = String(raw?.email ?? raw?.username ?? '').trim().toLowerCase();
  const password = String(raw?.password ?? '');

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Enter your work email address.' }, request_id: 'web' }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Enter your password.' }, request_id: 'web' }, { status: 400 });
  }

  const body = JSON.stringify({
    email,
    password,
  });
  let upstream: Response;
  try {
    upstream = await fetch(`${getGatewayBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'AUTH_UPSTREAM_UNREACHABLE',
          message: 'Authentication service is unavailable. Check the local gateway/auth stack.',
        },
        request_id: 'web',
      },
      { status: 503 }
    );
  }
  const text = await upstream.text();
  const data = text ? safeJsonParse(text) ?? {} : {};
  if (!upstream.ok) {
    const res = NextResponse.json(data, { status: upstream.status });
    const requestId = upstream.headers.get('x-request-id');
    if (requestId) {
      res.headers.set('x-request-id', requestId);
    }
    return res;
  }
  const token = data.access_token;
  if (!token) {
    return NextResponse.json({ error: { code: 'AUTH_INVALID', message: 'Login response did not include a session token.' }, request_id: data.request_id ?? 'web' }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(ttlFromToken(token)));
  return res;
}
