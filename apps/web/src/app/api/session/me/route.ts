import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookieOptions, SESSION_COOKIE } from '../../../../lib/auth/cookies';
import { verifySession } from '../../../../lib/auth/session';

export async function GET(req: NextRequest) {
  const optional = req.nextUrl.searchParams.get('optional') === '1';
  try {
    const session = await verifySession();
    const user = session.user;
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        orgName: user.orgName,
        orgKey: user.orgKey,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
      },
      username: user.name ?? user.email,
      org_name: user.orgName,
      org_key: user.orgKey,
      email: user.email,
      role: user.role,
      request_id: session.request_id ?? 'web',
    });
  } catch (error: any) {
    if (optional && (error?.status ?? 401) === 401) {
      return NextResponse.json({
        user: null,
        username: null,
        org_name: null,
        org_key: null,
        email: null,
        role: null,
        authenticated: false,
        request_id: error?.request_id ?? 'web',
      });
    }
    const res = NextResponse.json(
      {
        request_id: error?.request_id ?? 'web',
        code: error?.code ?? 'AUTH_INVALID',
        message: error?.message ?? 'Invalid token',
      },
      { status: error?.status ?? 401 }
    );
    res.cookies.set(SESSION_COOKIE, '', clearSessionCookieOptions());
    return res;
  }
}
