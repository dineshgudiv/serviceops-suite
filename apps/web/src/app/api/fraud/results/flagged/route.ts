import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../lib/org';
import { datasetArtifacts, listPaged, readWorkspace } from '../../../../../lib/fraud/server-storage';
import type { ServerFlaggedRow } from '../../../../../lib/fraud/server-types';

function matchesQuery(row: ServerFlaggedRow, query: string) {
  const needle = query.toLowerCase();
  return [row.transactionId, row.customerId, row.merchantId, row.deviceId]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export async function GET(req: NextRequest) {
  const scope = await getSessionOrgScope();
  const datasetId = String(req.nextUrl.searchParams.get('datasetId') ?? '');
  const page = Number(req.nextUrl.searchParams.get('page') ?? 1);
  const pageSize = Math.min(200, Number(req.nextUrl.searchParams.get('pageSize') ?? 50));
  const query = String(req.nextUrl.searchParams.get('query') ?? '').trim();
  const riskBand = String(req.nextUrl.searchParams.get('riskBand') ?? '').trim();
  const confidence = String(req.nextUrl.searchParams.get('confidence') ?? '').trim();
  const merchant = String(req.nextUrl.searchParams.get('merchant') ?? '').trim().toLowerCase();
  const customer = String(req.nextUrl.searchParams.get('customer') ?? '').trim().toLowerCase();
  const timeFrom = String(req.nextUrl.searchParams.get('timeFrom') ?? '').trim();
  const timeTo = String(req.nextUrl.searchParams.get('timeTo') ?? '').trim();
  const sortBy = String(req.nextUrl.searchParams.get('sortBy') ?? 'combinedRiskScore');
  const sortDir = String(req.nextUrl.searchParams.get('sortDir') ?? 'desc');
  const minAmount = req.nextUrl.searchParams.get('minAmount');
  const maxAmount = req.nextUrl.searchParams.get('maxAmount');
  const artifacts = datasetArtifacts(scope.orgKey, datasetId);
  const flaggedPath = artifacts.flaggedPath;
  let rows: ServerFlaggedRow[] = fs.existsSync(flaggedPath) ? JSON.parse(fs.readFileSync(flaggedPath, 'utf8')) : [];
  rows = rows.filter((row) => {
    if (query && !matchesQuery(row, query)) return false;
    if (riskBand && row.riskBand !== riskBand) return false;
    if (confidence && row.confidenceLevel !== confidence) return false;
    if (merchant && !String(row.merchantId ?? '').toLowerCase().includes(merchant)) return false;
    if (customer && !String(row.customerId ?? '').toLowerCase().includes(customer)) return false;
    if (minAmount && (row.amount ?? Number.NEGATIVE_INFINITY) < Number(minAmount)) return false;
    if (maxAmount && (row.amount ?? Number.POSITIVE_INFINITY) > Number(maxAmount)) return false;
    if (timeFrom && (!row.timestamp || new Date(row.timestamp).getTime() < new Date(timeFrom).getTime())) return false;
    if (timeTo && (!row.timestamp || new Date(row.timestamp).getTime() > new Date(timeTo).getTime())) return false;
    return true;
  });
  const sortKey = sortBy === 'riskScore' ? 'combinedRiskScore' : sortBy;
  rows.sort((left, right) => {
    const leftValue = sortKey === 'timestamp' ? new Date(left.timestamp ?? 0).getTime() : Number(left[sortKey as keyof ServerFlaggedRow] ?? 0);
    const rightValue = sortKey === 'timestamp' ? new Date(right.timestamp ?? 0).getTime() : Number(right[sortKey as keyof ServerFlaggedRow] ?? 0);
    return sortDir === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });
  const workspace = readWorkspace(scope.orgKey);
  return NextResponse.json({ ...listPaged(rows, page, pageSize), latestRun: workspace.runs.find((item) => item.datasetId === datasetId) ?? null });
}
