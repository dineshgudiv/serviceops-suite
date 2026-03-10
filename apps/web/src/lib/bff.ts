import type { BffResult } from './types';

function normalizePath(path: string) {
  const clean = path.replace(/^\/+/, '');
  if (clean.startsWith('api/')) {
    return `/api/bff/${clean.slice(4)}`;
  }
  return `/api/bff/${clean}`;
}

async function bffFetch<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<BffResult<T>> {
  const url = normalizePath(path);
  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
    const rawText = await res.text();
    let data: T | null = null;
    try {
      data = rawText ? (JSON.parse(rawText) as T) : null;
    } catch {
      data = null;
    }
    return {
      ok: res.ok,
      data,
      status: res.status,
      requestId: res.headers.get('x-request-id'),
      rawText,
    };
  } catch (err) {
    return {
      ok: false,
      data: null,
      status: 0,
      requestId: null,
      rawText: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function bffGet<T>(path: string) {
  return bffFetch<T>('GET', path);
}

export async function bffPost<T>(path: string, body: unknown) {
  return bffFetch<T>('POST', path, body);
}
