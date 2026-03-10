import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../lib/org';
import { readWorkspace } from '../../../../../lib/fraud/server-storage';
import { toServerAuditEvent } from '../../../../../lib/fraud/audit';

function filterRows(rows: ReturnType<typeof toServerAuditEvent>[], req: NextRequest) {
  const query = String(req.nextUrl.searchParams.get('query') ?? '').trim().toLowerCase();
  const eventType = String(req.nextUrl.searchParams.get('eventType') ?? '').trim();
  const dataset = String(req.nextUrl.searchParams.get('dataset') ?? '').trim();
  const user = String(req.nextUrl.searchParams.get('user') ?? '').trim().toLowerCase();
  const dateFrom = String(req.nextUrl.searchParams.get('dateFrom') ?? '').trim();
  const dateTo = String(req.nextUrl.searchParams.get('dateTo') ?? '').trim();
  return rows.filter((event) => {
    if (query) {
      const haystack = [event.resource, event.actor, event.details?.dataset_id, event.details?.job_id, event.details?.report_id, event.details?.filename].filter(Boolean).map((value) => String(value).toLowerCase());
      if (!haystack.some((value) => value.includes(query))) return false;
    }
    if (eventType && event.action !== eventType) return false;
    if (dataset && String(event.details?.dataset_id ?? '').toLowerCase() !== dataset.toLowerCase() && !event.resource.toLowerCase().includes(dataset.toLowerCase())) return false;
    if (user && !event.actor.toLowerCase().includes(user)) return false;
    if (dateFrom && new Date(event.at).getTime() < new Date(dateFrom).getTime()) return false;
    if (dateTo && new Date(event.at).getTime() > new Date(dateTo).getTime()) return false;
    return true;
  });
}

export async function GET(req: NextRequest) {
  const scope = await getSessionOrgScope();
  const format = String(req.nextUrl.searchParams.get('format') ?? 'json').toLowerCase();
  const workspace = readWorkspace(scope.orgKey);
  const rows = filterRows(workspace.auditEvents.map(toServerAuditEvent), req);

  if (format === 'csv') {
    const csv = [
      'id,at,action,category,severity,actor,resource,details',
      ...rows.map((event) =>
        [
          event.id,
          event.at,
          event.action,
          event.category,
          event.severity,
          event.actor,
          event.resource,
          JSON.stringify(event.details ?? {}).replace(/"/g, '""'),
        ]
          .map((value) => `"${String(value ?? '')}"`)
          .join(',')
      ),
    ].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="fraud_audit_log.csv"',
      },
    });
  }

  return NextResponse.json(rows, {
    headers: {
      'Content-Disposition': 'attachment; filename="fraud_audit_log.json"',
    },
  });
}
