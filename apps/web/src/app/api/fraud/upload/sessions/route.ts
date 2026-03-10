import { NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../lib/org';
import { listUploadSessions } from '../../../../../lib/fraud/server-storage';

export async function GET() {
  const scope = await getSessionOrgScope();
  return NextResponse.json({ sessions: listUploadSessions(scope.orgKey) });
}
