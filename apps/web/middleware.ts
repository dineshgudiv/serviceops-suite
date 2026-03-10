import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from './src/lib/auth/cookies';

const openPaths = [
  '/login',
  '/signup',
  '/forbidden',
  '/accept-invite',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/api/session/login',
  '/api/session/logout',
  '/api/session/me',
  '/api/session/accept-invite',
  '/api/session/forgot-password',
  '/api/session/reset-password',
  '/api/session/verify-email',
  '/api/gw/health',
];

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/_next/')) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (req.nextUrl.pathname === '/login') {
    return token ? NextResponse.redirect(new URL('/dashboard', req.url)) : NextResponse.next();
  }

  if (openPaths.some((p) => req.nextUrl.pathname.startsWith(p))) return NextResponse.next();

  if (!token) {
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = { matcher: ['/((?!favicon.ico).*)'] };

function redirectToLogin(req: NextRequest) {
  const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  const loginUrl = new URL('/login', req.url);
  if (next && next !== '/') {
    loginUrl.searchParams.set('next', next);
  }
  const res = NextResponse.redirect(loginUrl);
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
  return res;
}
