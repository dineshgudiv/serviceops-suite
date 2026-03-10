import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../lib/org';
import { listPaged, readWorkspace } from '../../../../lib/fraud/server-storage';
import { toServerAuditEvent } from '../../../../lib/fraud/audit';

export async function GET(req: NextRequest) {
  const scope = await getSessionOrgScope();
  const page = Number(req.nextUrl.searchParams.get('page') ?? 1);
  const pageSize = Math.min(200, Number(req.nextUrl.searchParams.get('pageSize') ?? 50));
  const query = String(req.nextUrl.searchParams.get('query') ?? '').trim().toLowerCase();
  const eventType = String(req.nextUrl.searchParams.get('eventType') ?? '').trim();
  const dataset = String(req.nextUrl.searchParams.get('dataset') ?? '').trim();
  const user = String(req.nextUrl.searchParams.get('user') ?? '').trim().toLowerCase();
  const dateFrom = String(req.nextUrl.searchParams.get('dateFrom') ?? '').trim();
  const dateTo = String(req.nextUrl.searchParams.get('dateTo') ?? '').trim();
  const workspace = readWorkspace(scope.orgKey);

  const rows = workspace.auditEvents
    .map(toServerAuditEvent)
    .filter((event) => {
      if (query) {
        const haystack = [
          event.resource,
          event.actor,
          event.details?.dataset_id,
          event.details?.job_id,
          event.details?.report_id,
          event.details?.filename,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        if (!haystack.some((value) => value.includes(query))) return false;
      }
      if (eventType && event.action !== eventType) return false;
      if (dataset && String(event.details?.dataset_id ?? '').toLowerCase() !== dataset.toLowerCase() && !event.resource.toLowerCase().includes(dataset.toLowerCase())) return false;
      if (user && !event.actor.toLowerCase().includes(user)) return false;
      if (dateFrom && new Date(event.at).getTime() < new Date(dateFrom).getTime()) return false;
      if (dateTo && new Date(event.at).getTime() > new Date(dateTo).getTime()) return false;
      return true;
    });

  return NextResponse.json({
    ...listPaged(rows, page, pageSize),
    eventTypes: [...new Set(workspace.auditEvents.map((event) => event.action))].sort(),
    datasets: workspace.datasets.map((item) => ({ id: item.id, name: item.name })),
    users: [...new Set(workspace.auditEvents.map((event) => event.actor))].sort(),
  });
}
