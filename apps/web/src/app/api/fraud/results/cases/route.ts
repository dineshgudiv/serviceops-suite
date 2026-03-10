import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../lib/org';
import { datasetArtifacts, listPaged, readWorkspace } from '../../../../../lib/fraud/server-storage';

export async function GET(req: NextRequest) {
  const scope = await getSessionOrgScope();
  const datasetId = String(req.nextUrl.searchParams.get('datasetId') ?? '');
  const page = Number(req.nextUrl.searchParams.get('page') ?? 1);
  const pageSize = Math.min(200, Number(req.nextUrl.searchParams.get('pageSize') ?? 24));
  const artifacts = datasetArtifacts(scope.orgKey, datasetId);
  const workspace = readWorkspace(scope.orgKey);
  const artifactRows = fs.existsSync(artifacts.casesPath) ? JSON.parse(fs.readFileSync(artifacts.casesPath, 'utf8')) : [];
  const workspaceRows = workspace.cases.filter((item) => item.datasetId === datasetId);
  const deduped = [...workspaceRows, ...artifactRows.filter((item: { id: string }) => !workspaceRows.some((caseRow) => caseRow.id === item.id))];
  return NextResponse.json(listPaged(deduped, page, pageSize));
}
