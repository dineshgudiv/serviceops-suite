import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../../lib/org';
import { appendAudit, readWorkspace, writeWorkspace } from '../../../../../../lib/fraud/server-storage';
import type { AnalystDisposition } from '../../../../../../lib/fraud/types';

export async function POST(req: NextRequest, { params }: { params: { caseId: string } }) {
  const scope = await getSessionOrgScope();
  const body = (await req.json()) as {
    datasetId: string;
    status?: AnalystDisposition;
    note?: string;
  };
  const workspace = readWorkspace(scope.orgKey);
  const caseRecord = workspace.cases.find((item) => item.id === params.caseId && item.datasetId === body.datasetId);
  if (!caseRecord) {
    return NextResponse.json({ request_id: 'web', code: 'CASE_NOT_FOUND', message: 'Case not found.' }, { status: 404 });
  }

  const updatedAt = new Date().toISOString();
  let changed = false;

  if (body.status && body.status !== caseRecord.status) {
    caseRecord.status = body.status;
    caseRecord.reviewedAt = updatedAt;
    caseRecord.reviewedBy = 'investigator@console';
    caseRecord.dispositionHistory.unshift({
      at: updatedAt,
      actor: 'investigator@console',
      disposition: body.status,
      note: body.note?.trim() || `Case status updated to ${body.status}.`,
    });
    changed = true;
    appendAudit(workspace, {
      actor: 'investigator@console',
      action: body.status === 'closed' ? 'case_closed' : 'case_status_updated',
      resource: caseRecord.title,
      details: { dataset_id: body.datasetId, case_id: caseRecord.id, disposition: body.status },
    });
  }

  if (body.note?.trim()) {
    caseRecord.note = body.note.trim();
    if (!body.status) {
      caseRecord.dispositionHistory.unshift({
        at: updatedAt,
        actor: 'investigator@console',
        disposition: caseRecord.status,
        note: body.note.trim(),
      });
      appendAudit(workspace, {
        actor: 'investigator@console',
        action: 'case_note_added',
        resource: caseRecord.title,
        details: { dataset_id: body.datasetId, case_id: caseRecord.id },
      });
    }
    changed = true;
  }

  if (!changed) {
    return NextResponse.json({ request_id: 'web', code: 'NO_CASE_CHANGES', message: 'No case changes were provided.' }, { status: 400 });
  }

  writeWorkspace(scope.orgKey, workspace);
  return NextResponse.json({ caseRecord });
}
