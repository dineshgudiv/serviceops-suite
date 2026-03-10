import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../lib/org';
import { appendAudit, readWorkspace, spawnBackgroundWorker, writeWorkspace } from '../../../../../lib/fraud/server-storage';

export async function POST(req: NextRequest) {
  const scope = await getSessionOrgScope();
  const { datasetId } = await req.json();
  const workspace = readWorkspace(scope.orgKey);
  const dataset = workspace.datasets.find((item) => item.id === datasetId);
  if (!dataset) return NextResponse.json({ code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' }, { status: 404 });
  const hasAmount = dataset.schema.some((field) => field.mappedTo === 'amount');
  const hasTimestamp = dataset.schema.some((field) => field.mappedTo === 'timestamp');
  if (!hasAmount || !hasTimestamp) {
    return NextResponse.json({ request_id: 'web', code: 'MAPPING_INCOMPLETE', message: 'Map amount and timestamp columns before running analysis.' }, { status: 400 });
  }
  if (!(dataset.selectedFeatures?.length ?? 0)) {
    return NextResponse.json({ request_id: 'web', code: 'NO_FEATURES_SELECTED', message: 'Select at least one numeric feature before running analysis.' }, { status: 400 });
  }
  const jobId = `job_analysis_${Date.now()}`;
  workspace.jobs.unshift({
    id: jobId,
    datasetId,
    type: 'analysis',
    status: 'queued',
    progressPct: 0,
    startedAt: new Date().toISOString(),
    canRetry: true,
  });
  dataset.latestJobId = jobId;
  dataset.analysisReadiness = 'analysis_ready';
  appendAudit(workspace, {
    actor: 'investigator@console',
    action: 'analysis_started',
    resource: dataset.name,
    details: { dataset_id: datasetId, job_id: jobId },
  });
  writeWorkspace(scope.orgKey, workspace);
  spawnBackgroundWorker(scope.orgKey, jobId, 'analyze', datasetId);
  return NextResponse.json({ jobId, datasetId, status: 'queued' });
}
