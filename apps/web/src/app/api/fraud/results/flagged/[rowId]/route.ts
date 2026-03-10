import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../../lib/org';
import { appendAudit, datasetArtifacts, readWorkspace, writeWorkspace } from '../../../../../../lib/fraud/server-storage';
import type { ServerCaseRecord, ServerFlaggedRow } from '../../../../../../lib/fraud/server-types';

function readFlaggedRows(orgKey: string, datasetId: string) {
  const artifacts = datasetArtifacts(orgKey, datasetId);
  return fs.existsSync(artifacts.flaggedPath) ? (JSON.parse(fs.readFileSync(artifacts.flaggedPath, 'utf8')) as ServerFlaggedRow[]) : [];
}

function writeFlaggedRows(orgKey: string, datasetId: string, rows: ServerFlaggedRow[]) {
  const artifacts = datasetArtifacts(orgKey, datasetId);
  fs.writeFileSync(artifacts.flaggedPath, JSON.stringify(rows, null, 2), 'utf8');
}

export async function GET(req: NextRequest, { params }: { params: { rowId: string } }) {
  const scope = await getSessionOrgScope();
  const datasetId = String(req.nextUrl.searchParams.get('datasetId') ?? '');
  const rows = readFlaggedRows(scope.orgKey, datasetId);
  const row = rows.find((item) => item.id === params.rowId) ?? null;
  if (!row) return NextResponse.json({ request_id: 'web', code: 'ROW_NOT_FOUND', message: 'Suspicious row not found.' }, { status: 404 });
  const customerHistory = rows.filter((item) => item.customerId && item.customerId === row.customerId).slice(0, 6);
  const deviceHistory = rows.filter((item) => item.deviceId && item.deviceId === row.deviceId).slice(0, 6);
  const relatedTransactions = rows
    .filter((item) => item.id !== row.id && ((row.customerId && item.customerId === row.customerId) || (row.merchantId && item.merchantId === row.merchantId) || (row.deviceId && item.deviceId === row.deviceId)))
    .slice(0, 8);
  const merchantRows = rows.filter((item) => item.merchantId && item.merchantId === row.merchantId);
  return NextResponse.json({
    row,
    customerHistory,
    deviceHistory,
    relatedTransactions,
    merchantProfile: {
      merchantId: row.merchantId,
      suspiciousCount: merchantRows.length,
      suspiciousAmount: merchantRows.reduce((sum, item) => sum + (item.amount ?? 0), 0),
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { rowId: string } }) {
  const scope = await getSessionOrgScope();
  const body = (await req.json()) as {
    datasetId: string;
    action: 'create_case' | 'mark_fraud' | 'mark_legitimate' | 'update_status' | 'attach_evidence';
    status?: 'new' | 'under_investigation' | 'confirmed_fraud' | 'false_positive' | 'closed';
    evidenceType?: 'note' | 'document' | 'screenshot_reference';
    evidenceValue?: string;
  };
  const workspace = readWorkspace(scope.orgKey);
  const rows = readFlaggedRows(scope.orgKey, body.datasetId);
  const row = rows.find((item) => item.id === params.rowId);
  if (!row) return NextResponse.json({ request_id: 'web', code: 'ROW_NOT_FOUND', message: 'Suspicious row not found.' }, { status: 404 });

  let caseRecord = workspace.cases.find((item) => item.recordId === row.transactionId && item.datasetId === body.datasetId);

  if (body.action === 'create_case' && !caseRecord) {
    caseRecord = {
      id: `case_${row.transactionId}_${Date.now()}`,
      datasetId: body.datasetId,
      title: `Investigate transaction ${row.transactionId}`,
      createdAt: new Date().toISOString(),
      severity: row.riskBand,
      status: 'new',
      recordId: row.transactionId,
      transactionId: row.transactionId,
      customerId: row.customerId,
      merchantId: row.merchantId,
      amount: row.amount,
      combinedRiskScore: row.combinedRiskScore,
      anomalyScore: row.anomalyScore,
      whyFlagged: row.whyFlagged,
      whyLegit: row.whyLegit,
      finalRecommendation: row.finalRecommendation,
      recommendedAction: row.recommendedAction,
      ruleHits: row.ruleHits,
      linkedDocumentIds: [],
      caseLabelSource: row.labelSource,
      derivedRiskLabel: row.derivedRiskLabel,
      dispositionHistory: [{ at: new Date().toISOString(), actor: 'investigator@console', disposition: 'new', note: 'Case created from Fraud Detection.' }],
    } as ServerCaseRecord;
    workspace.cases.unshift(caseRecord);
    row.linkedCaseId = caseRecord.id;
    appendAudit(workspace, {
      actor: 'investigator@console',
      action: 'case_created',
      resource: caseRecord.title,
      details: { dataset_id: body.datasetId, case_id: caseRecord.id, record_id: row.transactionId },
    });
  }

  if (body.action === 'mark_fraud') {
    row.investigationStatus = 'confirmed_fraud';
    if (caseRecord) {
      caseRecord.status = 'confirmed_fraud';
      caseRecord.reviewedAt = new Date().toISOString();
      caseRecord.reviewedBy = 'investigator@console';
      caseRecord.dispositionHistory.unshift({ at: new Date().toISOString(), actor: 'investigator@console', disposition: 'confirmed_fraud', note: 'Marked as fraud from Fraud Detection.' });
      appendAudit(workspace, {
        actor: 'investigator@console',
        action: 'case_closed',
        resource: caseRecord.title,
        details: { dataset_id: body.datasetId, case_id: caseRecord.id, disposition: 'confirmed_fraud' },
      });
    }
  }

  if (body.action === 'mark_legitimate') {
    row.investigationStatus = 'false_positive';
    if (caseRecord) {
      caseRecord.status = 'false_positive';
      caseRecord.reviewedAt = new Date().toISOString();
      caseRecord.reviewedBy = 'investigator@console';
      caseRecord.dispositionHistory.unshift({ at: new Date().toISOString(), actor: 'investigator@console', disposition: 'false_positive', note: 'Marked as legitimate from Fraud Detection.' });
      appendAudit(workspace, {
        actor: 'investigator@console',
        action: 'case_closed',
        resource: caseRecord.title,
        details: { dataset_id: body.datasetId, case_id: caseRecord.id, disposition: 'false_positive' },
      });
    }
  }

  if (body.action === 'update_status' && body.status) {
    row.investigationStatus = body.status;
    appendAudit(workspace, {
      actor: 'investigator@console',
      action: body.status === 'closed' ? 'case_closed' : 'case_status_updated',
      resource: row.transactionId,
      details: { dataset_id: body.datasetId, record_id: row.transactionId, status: body.status },
    });
  }

  if (body.action === 'attach_evidence' && body.evidenceType && body.evidenceValue?.trim()) {
    row.evidenceLinks = row.evidenceLinks ?? [];
    row.evidenceLinks.unshift({ type: body.evidenceType, value: body.evidenceValue.trim(), at: new Date().toISOString() });
  }

  writeFlaggedRows(scope.orgKey, body.datasetId, rows);
  writeWorkspace(scope.orgKey, workspace);
  return NextResponse.json({ row, caseRecord: caseRecord ?? null });
}
