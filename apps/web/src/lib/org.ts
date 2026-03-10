export type SessionOrgScope = {
  orgKey: string;
  orgName?: string | null;
};

type SessionMe = {
  user?: {
    orgKey?: string | null;
    orgName?: string | null;
  };
};

async function fetchOptionalSession(): Promise<SessionMe | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  const res = await fetch('/api/session/me?optional=1', {
    cache: 'no-store',
    credentials: 'include',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw {
      status: res.status,
      code: data?.error?.code ?? data?.code ?? 'AUTH_REQUIRED',
      message: data?.error?.message ?? data?.message ?? 'Unable to resolve organization scope.',
      request_id: data?.request_id,
    };
  }

  return (data?.user ? (data as SessionMe) : null);
}

export async function getSessionOrgScope(): Promise<SessionOrgScope> {
  if (typeof window === 'undefined') {
    return {
      orgKey: 'workspace-default',
      orgName: 'Current workspace',
    };
  }
  const session = await fetchOptionalSession();
  if (!session?.user?.orgKey) {
    return {
      orgKey: 'workspace-default',
      orgName: 'Current workspace',
    };
  }
  const orgKey = String(session.user?.orgKey ?? '').trim();
  if (!orgKey) {
    throw {
      status: 400,
      code: 'ORG_SCOPE_REQUIRED',
      message: 'No organization selected. Choose an organization and retry.',
      request_id: 'web',
    };
  }

  return {
    orgKey,
    orgName: session.user?.orgName ?? null,
  };
}
