import { NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../lib/org';
import { readWorkspace } from '../../../../../lib/fraud/server-storage';

export async function GET() {
  const scope = await getSessionOrgScope();
  const workspace = readWorkspace(scope.orgKey);
  return new NextResponse(JSON.stringify(workspace.settings, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="fraud_settings.json"',
    },
  });
}
