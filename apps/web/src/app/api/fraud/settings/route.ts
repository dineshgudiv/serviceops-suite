import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../../lib/auth/session';
import { getSessionOrgScope } from '../../../../lib/org';
import { DEFAULT_SETTINGS, ensureWorkspace, readWorkspace, resetWorkspaceSettings, updateWorkspaceSettings, writeWorkspace } from '../../../../lib/fraud/server-storage';
import type { WorkspaceSettings } from '../../../../lib/fraud/types';

function cloneSettings(settings: WorkspaceSettings): WorkspaceSettings {
  return {
    ...settings,
    enabledRules: [...settings.enabledRules],
    riskBands: { ...settings.riskBands },
  };
}

function validateSettings(input: WorkspaceSettings) {
  const errors: string[] = [];
  if (input.anomalyThreshold <= 0 || input.anomalyThreshold > 1) errors.push('Anomaly threshold must be between 0 and 1.');
  if (input.contamination <= 0 || input.contamination > 0.5) errors.push('Contamination must be between 0 and 0.5.');
  if (input.highAmountThreshold <= 0) errors.push('High amount threshold must be greater than 0.');
  if (input.rapidRepeatTransactionCount <= 0) errors.push('Rapid repeat transaction count must be greater than 0.');
  if (input.rapidRepeatWindowMinutes <= 0) errors.push('Rapid repeat window must be greater than 0 minutes.');
  if (input.merchantClusterSize <= 0) errors.push('Merchant cluster size must be greater than 0.');
  if (input.deviceChangeWindowMinutes <= 0) errors.push('Device change window must be greater than 0 minutes.');
  if (input.derivedMediumRiskThreshold <= 0 || input.derivedHighRiskThreshold <= 0) errors.push('Derived risk thresholds must be greater than 0.');
  if (input.derivedMediumRiskThreshold >= input.derivedHighRiskThreshold) errors.push('Derived medium-risk threshold must be lower than the high-risk threshold.');
  if (input.unusualHourStart < 0 || input.unusualHourStart > 23 || input.unusualHourEnd < 0 || input.unusualHourEnd > 23) errors.push('Unusual-hour boundaries must be between 0 and 23.');
  if (input.riskBands.medium >= input.riskBands.high || input.riskBands.high >= input.riskBands.critical) errors.push('Risk bands must be ordered from medium to high to critical.');
  return errors;
}

async function resolvePermissions() {
  try {
    const session = await verifySession();
    const role = String(session.user.role ?? '').toLowerCase();
    return {
      actor: session.user.email ?? session.user.name ?? 'investigator@console',
      canEdit: role === 'admin',
      role: session.user.role ?? 'user',
      authenticated: true,
    };
  } catch {
    return {
      actor: 'investigator@console',
      canEdit: true,
      role: 'local_workspace',
      authenticated: false,
    };
  }
}

export async function GET() {
  const scope = await getSessionOrgScope();
  const permissions = await resolvePermissions();
  ensureWorkspace(scope.orgKey, scope.orgName ?? 'Current workspace');
  const workspace = readWorkspace(scope.orgKey);
  return NextResponse.json({
    settings: workspace.settings,
    defaults: DEFAULT_SETTINGS,
    history: workspace.settingsHistory ?? [],
    canEdit: permissions.canEdit,
    role: permissions.role,
    authenticated: permissions.authenticated,
  });
}

export async function PUT(req: NextRequest) {
  const scope = await getSessionOrgScope();
  const permissions = await resolvePermissions();
  if (!permissions.canEdit) {
    return NextResponse.json({ request_id: 'web', code: 'FORBIDDEN', message: 'Only admin users can edit fraud settings.' }, { status: 403 });
  }
  const body = (await req.json()) as { settings: WorkspaceSettings };
  const errors = validateSettings(body.settings);
  if (errors.length) {
    return NextResponse.json({ request_id: 'web', code: 'INVALID_SETTINGS', message: 'Settings validation failed.', details: errors }, { status: 400 });
  }
  const workspace = updateWorkspaceSettings(scope.orgKey, body.settings, permissions.actor);
  return NextResponse.json({ settings: workspace.settings, message: 'Settings saved.', history: workspace.settingsHistory ?? [] });
}

export async function DELETE() {
  const scope = await getSessionOrgScope();
  const permissions = await resolvePermissions();
  if (!permissions.canEdit) {
    return NextResponse.json({ request_id: 'web', code: 'FORBIDDEN', message: 'Only admin users can reset fraud settings.' }, { status: 403 });
  }
  const workspace = resetWorkspaceSettings(scope.orgKey, permissions.actor);
  return NextResponse.json({ settings: workspace.settings, message: 'Settings reset to defaults.', history: workspace.settingsHistory ?? [] });
}

export async function POST(req: NextRequest) {
  const scope = await getSessionOrgScope();
  const permissions = await resolvePermissions();
  if (!permissions.canEdit) {
    return NextResponse.json({ request_id: 'web', code: 'FORBIDDEN', message: 'Only admin users can change fraud settings.' }, { status: 403 });
  }
  const body = (await req.json()) as
    | { action: 'rollback'; versionId: string }
    | { action: 'import'; settings: WorkspaceSettings };
  const workspace = readWorkspace(scope.orgKey);

  if (body.action === 'rollback') {
    const version = (workspace.settingsHistory ?? []).find((item) => item.id === body.versionId);
    if (!version) {
      return NextResponse.json({ request_id: 'web', code: 'SETTINGS_VERSION_NOT_FOUND', message: 'Settings version not found.' }, { status: 404 });
    }
    const nextWorkspace = updateWorkspaceSettings(scope.orgKey, cloneSettings(version.previous), permissions.actor);
    return NextResponse.json({ settings: nextWorkspace.settings, message: 'Configuration rolled back.', history: nextWorkspace.settingsHistory ?? [] });
  }

  const errors = validateSettings(body.settings);
  if (errors.length) {
    return NextResponse.json({ request_id: 'web', code: 'INVALID_SETTINGS_IMPORT', message: 'Imported configuration failed validation.', details: errors }, { status: 400 });
  }
  const nextWorkspace = updateWorkspaceSettings(scope.orgKey, body.settings, permissions.actor);
  return NextResponse.json({ settings: nextWorkspace.settings, message: 'Configuration imported.', history: nextWorkspace.settingsHistory ?? [] });
}
