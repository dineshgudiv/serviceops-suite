export function readQuery(search: URLSearchParams, key: string, fallback = '') {
  const v = search.get(key);
  return v == null || v === '' ? fallback : v;
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}
