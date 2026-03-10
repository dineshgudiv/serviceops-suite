import { NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../../lib/org';
import { cancelJob } from '../../../../../../lib/fraud/server-storage';

export async function POST(_: Request, { params }: { params: { jobId: string } }) {
  const scope = await getSessionOrgScope();
  return NextResponse.json({ job: cancelJob(scope.orgKey, params.jobId) });
}
