import { NextResponse } from 'next/server';
import { verifySession } from '../../../../lib/auth/session';
import { getSessionOrgScope } from '../../../../lib/org';
import { ensureWorkspace, readWorkspace } from '../../../../lib/fraud/server-storage';

async function resolvePermissions() {
  try {
    const session = await verifySession();
    const role = String(session.user.role ?? '').toLowerCase();
    return {
      canDeleteDatasets: role === 'admin',
      role: session.user.role ?? 'user',
      authenticated: true,
    };
  } catch {
    return {
      canDeleteDatasets: true,
      role: 'local_workspace',
      authenticated: false,
    };
  }
}

export async function GET() {
  const scope = await getSessionOrgScope();
  const permissions = await resolvePermissions();
  ensureWorkspace(scope.orgKey, scope.orgName ?? 'Current workspace');
  return NextResponse.json({ workspace: readWorkspace(scope.orgKey), permissions });
}
