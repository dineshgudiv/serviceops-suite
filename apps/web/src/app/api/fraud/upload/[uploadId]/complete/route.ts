import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../../lib/org';
import { datasetArtifacts, readUploadManifest, readWorkspace, spawnBackgroundWorker, updateJob, writeUploadManifest, writeWorkspace } from '../../../../../../lib/fraud/server-storage';

export async function POST(_: Request, { params }: { params: { uploadId: string } }) {
  const scope = await getSessionOrgScope();
  const { path: manifestPath, data } = readUploadManifest(scope.orgKey, params.uploadId);
  if (data.cancelledAt) {
    return NextResponse.json({ code: 'UPLOAD_CANCELLED', message: 'Upload session has been cancelled.' }, { status: 409 });
  }
  const artifacts = datasetArtifacts(scope.orgKey, data.datasetId);
  const sourcePath = `${artifacts.sourcePath}${path.extname(data.filename).toLowerCase()}`;
  const parts = fs.readdirSync(path.dirname(manifestPath)).filter((file) => file.endsWith('.part')).sort();
  const output = fs.createWriteStream(sourcePath);
  for (const file of parts) {
    output.write(fs.readFileSync(path.join(path.dirname(manifestPath), file)));
  }
  output.end();
  writeUploadManifest(manifestPath, { ...data, completedAt: new Date().toISOString(), sourcePath });
  updateJob(scope.orgKey, data.jobId, (job, workspace) => {
    job.status = 'uploaded';
    job.progressPct = 100;
    const dataset = workspace.datasets.find((item) => item.id === data.datasetId);
    if (dataset) {
      dataset.status = 'uploaded';
      dataset.stagedPath = sourcePath;
      dataset.latestJobId = job.id;
      dataset.analysisReadiness = 'parsing';
    }
  });
  if (data.kind === 'pdf') {
    const current = readWorkspace(scope.orgKey);
    current.documents = [
      {
        id: data.datasetId,
        datasetId: current.activeDatasetId,
        name: data.filename,
        uploadedAt: new Date().toISOString(),
        size: data.size,
        parseStatus: 'image_only_or_unparsed',
        snippet: 'PDF stored on the server-backed evidence pipeline. OCR is not implemented; text extraction is limited in this build.',
        linkedCaseIds: [],
        linkedRecordIds: [],
      },
      ...current.documents.filter((item) => item.id !== data.datasetId),
    ];
    const uploadJob = current.jobs.find((item) => item.id === data.jobId);
    if (uploadJob) {
      uploadJob.status = 'completed';
      uploadJob.finishedAt = new Date().toISOString();
    }
    writeWorkspace(scope.orgKey, current);
    return NextResponse.json({ datasetId: data.datasetId, jobId: data.jobId, status: 'completed' });
  }
  const parseJobId = `job_parse_${Date.now()}`;
  const current = readWorkspace(scope.orgKey);
  current.jobs.unshift({
    id: parseJobId,
    datasetId: data.datasetId,
    type: 'parse',
    status: 'queued',
    progressPct: 0,
    startedAt: new Date().toISOString(),
    canRetry: true,
  });
  const dataset = current.datasets.find((item: any) => item.id === data.datasetId);
  if (dataset) dataset.latestJobId = parseJobId;
  writeWorkspace(scope.orgKey, current);
  spawnBackgroundWorker(scope.orgKey, parseJobId, 'parse', data.datasetId);
  return NextResponse.json({ datasetId: data.datasetId, jobId: parseJobId, status: 'queued' });
}
