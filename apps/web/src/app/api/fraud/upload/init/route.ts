import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../lib/org';
import { createUploadSession } from '../../../../../lib/fraud/server-storage';

export async function POST(req: NextRequest) {
  const scope = await getSessionOrgScope();
  const body = await req.json();
  const session = createUploadSession(scope.orgKey, String(body.filename ?? ''), Number(body.size ?? 0), body.kind === 'pdf' ? 'pdf' : 'dataset');
  return NextResponse.json(session);
}
