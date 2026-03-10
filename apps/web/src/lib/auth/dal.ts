import { redirect } from 'next/navigation';
import { getCurrentSession, verifySession } from './session';
import { hasAnyRole, normalizeRole } from './roles';

function loginRedirect(next?: string) {
  const encoded = next ? `?next=${encodeURIComponent(next)}` : '';
  redirect(`/login${encoded}`);
}

export async function requireAuth(next?: string) {
  try {
    return await verifySession();
  } catch {
    loginRedirect(next);
  }
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function requireRole(...roles: string[]) {
  const session = await requireAuth();
  if (!hasAnyRole(session.user.role, roles)) {
    redirect('/forbidden');
  }
  return session;
}

export async function requireAnyRole(...roles: string[]) {
  return requireRole(...roles);
}

export async function requireConsoleAccess(next?: string) {
  return requireRole('ADMIN', 'ANALYST', 'READONLY');
}

export async function requirePortalAccess(next?: string) {
  return requireRole('ADMIN', 'ANALYST', 'REQUESTER');
}

export async function requireOrgAccess(orgId: string) {
  const session = await requireAuth();
  if (session.user.orgId !== orgId) {
    redirect('/forbidden');
  }
  return session;
}

export function canAccessAdmin(role?: string | null) {
  return normalizeRole(role) === 'ADMIN';
}
