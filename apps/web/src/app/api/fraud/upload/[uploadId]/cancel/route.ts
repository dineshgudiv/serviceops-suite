import { NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../../lib/org';
import { cancelUploadSession } from '../../../../../../lib/fraud/server-storage';

export async function POST(_: Request, { params }: { params: { uploadId: string } }) {
  const scope = await getSessionOrgScope();
  return NextResponse.json(cancelUploadSession(scope.orgKey, params.uploadId));
}
