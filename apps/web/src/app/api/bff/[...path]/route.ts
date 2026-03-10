import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookieOptions, SESSION_COOKIE } from '../../../../lib/auth/cookies';
import { verifySession } from '../../../../lib/auth/session';
import { hasRole } from '../../../../lib/auth/roles';
import { getGatewayBaseUrl } from '../../../../lib/server/gateway';

const allow = new Set(['auth', 'itsm', 'audit', 'sla', 'cmdb', 'knowledge', 'integrations', 'workflow']);

function isAdminOnly(path: string[], method: string) {
  const [svc, ...rest] = path;
  if (svc !== 'auth') return false;
  const joined = rest.join('/');
  if (joined === 'register-invite') return true;
  if (/^orgs\/[^/]+\/users\/[^/]+\/resend-invite$/.test(joined)) return true;
  if (/^orgs\/[^/]+\/users(\/[^/]+\/(role|status))?$/.test(joined)) return true;
  return method !== 'GET' && /^orgs/.test(joined);
}

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const [svc, ...rest] = params.path || [];
  if (!allow.has(svc)) return NextResponse.json({ error: { code: 'BFF_DENY', message: 'Forbidden target' }, request_id: 'web' }, { status: 400 });
  let session;
  try {
    session = await verifySession();
  } catch (error: any) {
    const res = NextResponse.json(
      { error: { code: error?.code ?? 'AUTH_REQUIRED', message: error?.message ?? 'Not authenticated' }, request_id: error?.request_id ?? 'web' },
      { status: error?.status ?? 401 }
    );
    res.cookies.set(SESSION_COOKIE, '', clearSessionCookieOptions());
    return res;
  }
  if (isAdminOnly(params.path || [], req.method) && !hasRole(session.user.role, 'ADMIN')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN_ROLE', message: 'Admin access required' }, request_id: session.request_id ?? 'web' }, { status: 403 });
  }
  const url = `${getGatewayBaseUrl()}/api/${svc}/${rest.join('/')}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${session.token}`,
      'content-type': req.headers.get('content-type') || 'application/json',
    },
    body: req.method === 'GET' ? undefined : await req.text(),
    cache: 'no-store',
  };
  const upstream = await fetch(url, init);
  const text = await upstream.text();
  const res = new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
  const requestId = upstream.headers.get('x-request-id');
  if (requestId) res.headers.set('x-request-id', requestId);
  return res;
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx); }
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx); }
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx); }
