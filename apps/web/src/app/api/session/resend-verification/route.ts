import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/auth/cookies';
import { getGatewayBaseUrl } from '../../../../lib/server/gateway';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ request_id: 'web', code: 'AUTH_REQUIRED', message: 'Not authenticated' }, { status: 401 });
  }
  const upstream = await fetch(`${getGatewayBaseUrl()}/api/auth/resend-verification`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
