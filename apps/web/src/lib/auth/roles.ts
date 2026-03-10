export const ROLES = {
  ADMIN: 'ADMIN',
  ANALYST: 'ANALYST',
  READONLY: 'READONLY',
  REQUESTER: 'REQUESTER',
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES] | string;

export function normalizeRole(role?: string | null) {
  return (role ?? '').trim().toUpperCase();
}

export function hasRole(role: string | null | undefined, expected: string) {
  return normalizeRole(role) === normalizeRole(expected);
}

export function hasAnyRole(role: string | null | undefined, expected: string[]) {
  const actual = normalizeRole(role);
  return expected.some((item) => normalizeRole(item) === actual);
}
