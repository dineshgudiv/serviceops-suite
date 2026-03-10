export type AuthErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_UPSTREAM_UNREACHABLE'
  | 'AUTH_DISABLED'
  | 'AUTH_MEMBERSHIP_INACTIVE'
  | 'AUTH_EMAIL_UNVERIFIED'
  | 'FORBIDDEN'
  | 'FORBIDDEN_ROLE'
  | 'VALIDATION'
  | 'HTTP_ERROR'
  | 'NON_JSON';

export type AuthError = {
  status: number;
  code: AuthErrorCode | string;
  message: string;
  request_id?: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  orgId: string;
  orgName: string | null;
  orgKey: string | null;
  status: string | null;
  emailVerifiedAt: string | null;
};

export type SessionState = {
  user: SessionUser;
  request_id?: string;
  token: string;
};
