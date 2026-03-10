import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

export const SESSION_COOKIE = 'so_access';

export function sessionCookieOptions(maxAge?: number): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(typeof maxAge === 'number' && maxAge > 0 ? { maxAge } : {}),
  };
}

export function clearSessionCookieOptions(): Partial<ResponseCookie> {
  return {
    ...sessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  };
}
