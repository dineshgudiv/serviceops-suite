export type ApiError = {
  code: string;
  message: string;
  request_id: string | null;
  status: number;
  details?: unknown;
};

export type ApiResult<T> = {
  ok: boolean;
  data?: T;
  request_id?: string | null;
  status: number;
  error?: ApiError;
};

function toApiError(status: number, requestId: string | null, payload: unknown, raw: string): ApiError {
  const p = (payload ?? {}) as any;
  const err = p?.error ?? p;
  return {
    code: String(err?.code ?? (status === 403 ? 'BFF_DENY' : 'UNKNOWN_ERROR')),
    message: String(err?.message ?? raw ?? 'Request failed'),
    request_id: requestId ?? p?.request_id ?? null,
    status,
    details: err?.details,
  };
}

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const clean = path.replace(/^\/+/, '');
    const route = clean.startsWith('api/') ? `/api/bff/${clean.slice(4)}` : `/api/bff/${clean}`;
    const res = await fetch(route, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const raw = await res.text();
    let json: unknown = null;
    try { json = raw ? JSON.parse(raw) : null; } catch {}
    const requestId = res.headers.get('x-request-id');
    if (!res.ok) return { ok: false, status: res.status, error: toApiError(res.status, requestId, json, raw) };
    return { ok: true, data: (json as T), request_id: requestId, status: res.status };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: {
        code: 'NETWORK_ERROR',
        message: e instanceof Error ? e.message : 'Network error',
        request_id: null,
        status: 0,
      },
    };
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
