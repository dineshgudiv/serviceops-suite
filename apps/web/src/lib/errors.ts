export function errorTitle(code: string) {
  if (code === 'BFF_DENY') return 'Forbidden target / RBAC';
  if (code === 'AUTH_REQUIRED') return 'Authentication required';
  if (code === 'AUTH_UPSTREAM_UNREACHABLE') return 'Authentication service unavailable';
  return 'Request failed';
}
