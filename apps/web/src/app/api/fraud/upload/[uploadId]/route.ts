import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../lib/org';
import { readUploadManifest, updateJob, writeUploadManifest } from '../../../../../lib/fraud/server-storage';

export async function GET(_: NextRequest, { params }: { params: { uploadId: string } }) {
  const scope = await getSessionOrgScope();
  const { data } = readUploadManifest(scope.orgKey, params.uploadId);
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { uploadId: string } }) {
  const scope = await getSessionOrgScope();
  const { path: manifestPath, data } = readUploadManifest(scope.orgKey, params.uploadId);
  if (data.cancelledAt) {
    return NextResponse.json({ code: 'UPLOAD_CANCELLED', message: 'Upload session has been cancelled.' }, { status: 409 });
  }
  const chunkIndex = Number(req.headers.get('x-fraud-chunk-index') ?? -1);
  if (chunkIndex < 0) {
    return NextResponse.json({ code: 'CHUNK_INDEX_REQUIRED', message: 'Chunk index header is required.' }, { status: 400 });
  }
  const buffer = Buffer.from(await req.arrayBuffer());
  const chunkPath = path.join(path.dirname(manifestPath), `${String(chunkIndex).padStart(8, '0')}.part`);
  fs.writeFileSync(chunkPath, buffer);
  data.uploadedBytes = Math.min(data.size, (data.uploadedBytes ?? 0) + buffer.byteLength);
  writeUploadManifest(manifestPath, data);
  const job = updateJob(scope.orgKey, data.jobId, (current, workspace) => {
    current.uploadedBytes = data.uploadedBytes;
    current.totalBytes = data.size;
    current.progressPct = Math.min(99, Math.round((data.uploadedBytes / data.size) * 100));
    current.status = 'uploading';
    const dataset = workspace.datasets.find((item) => item.id === data.datasetId);
    if (dataset) dataset.status = 'uploading';
  });
  return NextResponse.json({ job });
}
