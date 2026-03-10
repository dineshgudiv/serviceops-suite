import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../../../lib/auth/session';
import { getSessionOrgScope } from '../../../../../lib/org';
import { deleteDatasetDeep, readWorkspace, writeWorkspace } from '../../../../../lib/fraud/server-storage';
import type { FraudCanonicalField } from '../../../../../lib/fraud/types';

async function resolvePermissions() {
  try {
    const session = await verifySession();
    const role = String(session.user.role ?? '').toLowerCase();
    return {
      actor: session.user.email ?? session.user.name ?? 'investigator@console',
      canDelete: role === 'admin',
      role: session.user.role ?? 'user',
      authenticated: true,
    };
  } catch {
    return {
      actor: 'investigator@console',
      canDelete: true,
      role: 'local_workspace',
      authenticated: false,
    };
  }
}

export async function PUT(req: NextRequest, { params }: { params: { datasetId: string } }) {
  const scope = await getSessionOrgScope();
  const { datasetId } = params;
  const body = (await req.json()) as {
    active?: boolean;
    mapping?: Array<{ columnName: string; mappedTo?: FraudCanonicalField }>;
    selectedFeatures?: string[];
    labelColumn?: string;
    selectedSheet?: string;
  };
  const workspace = readWorkspace(scope.orgKey);
  const dataset = workspace.datasets.find((item) => item.id === datasetId);
  if (!dataset) {
    return NextResponse.json({ request_id: 'web', code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' }, { status: 404 });
  }

  if (body.active) {
    workspace.activeDatasetId = datasetId;
  }
  if (body.mapping) {
    const nextMap = new Map(body.mapping.map((item) => [item.columnName, item.mappedTo]));
    dataset.schema = dataset.schema.map((field) => ({ ...field, mappedTo: nextMap.has(field.name) ? nextMap.get(field.name) : field.mappedTo }));
    dataset.mappingCompleteness = dataset.schema.length ? dataset.schema.filter((field) => field.mappedTo).length / dataset.schema.length : 0;
  }
  if (body.selectedFeatures) {
    dataset.selectedFeatures = body.selectedFeatures.filter((name) => dataset.schema.some((field) => field.name === name));
    dataset.usableFeatureCount = dataset.selectedFeatures.length + dataset.schema.filter((field) => field.dataType === 'datetime').length;
  }
  if (body.selectedSheet) {
    dataset.selectedSheet = body.selectedSheet;
  }
  if (body.labelColumn !== undefined) {
    dataset.labelColumn = body.labelColumn || undefined;
    dataset.labelColumnMapped = Boolean(dataset.labelColumn);
  } else {
    dataset.labelColumn = dataset.schema.find((field) => field.mappedTo === 'fraud_label')?.name;
    dataset.labelColumnMapped = Boolean(dataset.labelColumn);
  }
  dataset.labelMode = dataset.labelColumnMapped ? 'ground_truth' : 'derived_only';
  dataset.analysisReadiness = !dataset.schema.some((field) => field.mappedTo === 'amount') || !dataset.schema.some((field) => field.mappedTo === 'timestamp')
    ? 'waiting_for_mapping'
    : dataset.usableFeatureCount
    ? 'ready_for_analysis'
    : 'analysis_blocked';
  writeWorkspace(scope.orgKey, workspace);
  return NextResponse.json({ dataset });
}

export async function DELETE(req: NextRequest, { params }: { params: { datasetId: string } }) {
  const scope = await getSessionOrgScope();
  const permissions = await resolvePermissions();
  if (!permissions.canDelete) {
    return NextResponse.json({ request_id: 'web', code: 'FORBIDDEN', message: 'Only admin users can delete fraud datasets.' }, { status: 403 });
  }
  const force = req.nextUrl.searchParams.get('force') === '1';
  const workspace = readWorkspace(scope.orgKey);
  const dataset = workspace.datasets.find((item) => item.id === params.datasetId);
  if (!dataset) {
    return NextResponse.json({ request_id: 'web', code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' }, { status: 404 });
  }
  if (workspace.activeDatasetId === params.datasetId && !force) {
    return NextResponse.json(
      {
        request_id: 'web',
        code: 'ACTIVE_DATASET_DELETE_REQUIRES_CONFIRMATION',
        message: 'Deleting the active dataset requires explicit confirmation.',
        details: {
          dataset_id: dataset.id,
          dataset_name: dataset.name,
        },
      },
      { status: 409 }
    );
  }
  const result = deleteDatasetDeep(scope.orgKey, params.datasetId, permissions.actor);
  return NextResponse.json({
    success: true,
    datasetId: result.datasetId,
    datasetName: result.datasetName,
    deletionMode: result.deletionMode,
    removed: result.removed,
    nextActiveDatasetId: result.nextActiveDatasetId,
  });
}
