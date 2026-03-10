import { NextResponse } from 'next/server';
import { clearSessionCookieOptions, SESSION_COOKIE } from '../../../../lib/auth/cookies';
import { getGatewayBaseUrl } from '../../../../lib/server/gateway';

export async function POST(req: Request) {
  const cookie = (req.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(`${SESSION_COOKIE}=`.length);
  if (token) {
    await fetch(`${getGatewayBaseUrl()}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
  }).catch(() => null);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', clearSessionCookieOptions());
  return res;
}
