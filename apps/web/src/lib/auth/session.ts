import { cache } from 'react';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './cookies';
import type { AuthError, SessionState } from './dto';
import { getGatewayBaseUrl } from '../server/gateway';

function authError(status: number, code: string, message: string, request_id?: string): AuthError {
  return { status, code, message, request_id };
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readTokenFromCookieStore() {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

async function fetchSessionFromToken(token: string): Promise<SessionState> {
  let upstream: Response;
  try {
    upstream = await fetch(`${getGatewayBaseUrl()}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    throw authError(503, 'AUTH_UPSTREAM_UNREACHABLE', 'Authentication service is unavailable');
  }
  const text = await upstream.text();
  const data = text ? safeJsonParse(text) : {};

  if (!upstream.ok) {
    throw authError(
      upstream.status,
      data?.error?.code ?? data?.code ?? 'AUTH_INVALID',
      data?.error?.message ?? data?.message ?? 'Invalid session',
      data?.request_id
    );
  }

  const user = data?.user;
  if (!user?.id || !user?.orgId || !user?.role) {
    throw authError(401, 'AUTH_INVALID', 'Session payload is incomplete', data?.request_id);
  }

  return {
    token,
    request_id: data?.request_id,
    user: {
      id: String(user.id),
      email: String(user.email ?? ''),
      name: user.name ?? null,
      role: String(user.role),
      orgId: String(user.orgId),
      orgName: user.orgName ?? null,
      orgKey: user.orgKey ?? null,
      status: user.status ?? null,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
    },
  };
}

export const getCurrentSession = cache(async (): Promise<SessionState | null> => {
  const token = readTokenFromCookieStore();
  if (!token) return null;
  try {
    return await fetchSessionFromToken(token);
  } catch {
    return null;
  }
});

export async function verifySession(): Promise<SessionState> {
  const token = readTokenFromCookieStore();
  if (!token) {
    throw authError(401, 'AUTH_REQUIRED', 'Not authenticated');
  }
  return fetchSessionFromToken(token);
}

export function decodeJwtExpiry(token: string) {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof payload?.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export function ttlFromToken(token: string) {
  const exp = decodeJwtExpiry(token);
  if (!exp) return undefined;
  const ttl = exp - Math.floor(Date.now() / 1000);
  return ttl > 0 ? ttl : undefined;
}
