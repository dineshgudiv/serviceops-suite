import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import type { AuditEvent, WorkspaceSettings } from './types';
import type {
  FraudJob,
  FraudServerWorkspace,
  FraudUploadInitResponse,
  FraudUploadSessionStatus,
  ServerDatasetSummary,
} from './server-types';

const DATA_ROOT = process.env.FRAUD_OPS_DATA_ROOT || path.join(os.tmpdir(), 'fraud-ops-risk-console');
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024 * 1024;
const ALLOWED_DATASET_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.xlsm', '.xlsb']);
const ALLOWED_PDF_EXTENSIONS = new Set(['.pdf']);

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  anomalyThreshold: 0.92,
  contamination: 0.1,
  enabledRules: ['high_amount', 'unusual_hour', 'new_device_high_amount', 'new_location_high_amount', 'rapid_repeat', 'risky_merchant_cluster'],
  highAmountThreshold: 4000,
  unusualHourStart: 0,
  unusualHourEnd: 5,
  rapidRepeatTransactionCount: 3,
  rapidRepeatWindowMinutes: 10,
  merchantClusterSize: 5,
  deviceChangeWindowMinutes: 30,
  derivedHighRiskThreshold: 70,
  derivedMediumRiskThreshold: 45,
  riskBands: {
    critical: 85,
    high: 70,
    medium: 50,
  },
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function orgRoot(orgKey: string) {
  return path.join(DATA_ROOT, sanitizeSegment(orgKey));
}

function workspacePath(orgKey: string) {
  return path.join(orgRoot(orgKey), 'workspace.json');
}

function uploadsRoot(orgKey: string) {
  return path.join(orgRoot(orgKey), 'uploads');
}

function datasetsRoot(orgKey: string) {
  return path.join(orgRoot(orgKey), 'datasets');
}

function reportsRoot(orgKey: string) {
  return path.join(orgRoot(orgKey), 'reports');
}

export function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export function safeFilename(filename: string) {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]+/g, '_');
  return base || `upload_${Date.now()}`;
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

export function validateUpload(filename: string, size: number, kind: 'dataset' | 'pdf') {
  const ext = path.extname(filename).toLowerCase();
  const allowlist = kind === 'pdf' ? ALLOWED_PDF_EXTENSIONS : ALLOWED_DATASET_EXTENSIONS;
  if (!allowlist.has(ext)) {
    throw { status: 400, code: 'UNSUPPORTED_FILE_TYPE', message: `Unsupported file type ${ext || 'unknown'}.` };
  }
  if (size <= 0) {
    throw { status: 400, code: 'EMPTY_FILE', message: 'The uploaded file is empty.' };
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw { status: 413, code: 'FILE_TOO_LARGE', message: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit.` };
  }
}

export function ensureWorkspace(orgKey: string, orgName = 'Current workspace'): FraudServerWorkspace {
  ensureDir(orgRoot(orgKey));
  ensureDir(uploadsRoot(orgKey));
  ensureDir(datasetsRoot(orgKey));
  ensureDir(reportsRoot(orgKey));
  if (!fs.existsSync(workspacePath(orgKey))) {
    const workspace: FraudServerWorkspace = {
      version: 2,
      orgKey,
      orgName,
      settings: DEFAULT_SETTINGS,
      datasets: [],
      jobs: [],
      runs: [],
      cases: [],
      documents: [],
      reports: [],
      auditEvents: [],
      settingsHistory: [],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(workspacePath(orgKey), JSON.stringify(workspace, null, 2), 'utf8');
    return workspace;
  }
  return readWorkspace(orgKey);
}

export function readWorkspace(orgKey: string) {
  return JSON.parse(fs.readFileSync(workspacePath(orgKey), 'utf8')) as FraudServerWorkspace;
}

export function writeWorkspace(orgKey: string, workspace: FraudServerWorkspace) {
  workspace.updatedAt = new Date().toISOString();
  fs.writeFileSync(workspacePath(orgKey), JSON.stringify(workspace, null, 2), 'utf8');
}

export function updateWorkspaceSettings(orgKey: string, nextSettings: WorkspaceSettings, actor = 'investigator@console') {
  const workspace = ensureWorkspace(orgKey);
  const previousSettings = JSON.parse(JSON.stringify(workspace.settings)) as WorkspaceSettings;
  workspace.settings = nextSettings;
  workspace.settingsHistory = workspace.settingsHistory ?? [];
  workspace.settingsHistory.unshift({
    id: createId('settings_version'),
    at: new Date().toISOString(),
    actor,
    previous: previousSettings,
    next: JSON.parse(JSON.stringify(nextSettings)) as WorkspaceSettings,
  });
  appendAudit(workspace, {
    actor,
    action: 'settings_updated',
    resource: 'workspace_settings',
    details: {
      anomaly_threshold: nextSettings.anomalyThreshold,
      contamination: nextSettings.contamination,
      high_amount_threshold: nextSettings.highAmountThreshold,
      enabled_rules: nextSettings.enabledRules.length,
    },
  });
  writeWorkspace(orgKey, workspace);
  return workspace;
}

export function resetWorkspaceSettings(orgKey: string, actor = 'investigator@console') {
  return updateWorkspaceSettings(
    orgKey,
    { ...DEFAULT_SETTINGS, riskBands: { ...DEFAULT_SETTINGS.riskBands }, enabledRules: [...DEFAULT_SETTINGS.enabledRules] },
    actor
  );
}

export function appendAudit(workspace: FraudServerWorkspace, event: Omit<AuditEvent, 'id' | 'at'>) {
  workspace.auditEvents.unshift({
    id: createId('audit'),
    at: new Date().toISOString(),
    ...event,
  });
}

export function createUploadSession(orgKey: string, filename: string, size: number, kind: 'dataset' | 'pdf'): FraudUploadInitResponse {
  validateUpload(filename, size, kind);
  const workspace = ensureWorkspace(orgKey);
  const uploadId = createId('upload');
  const datasetId = createId(kind === 'pdf' ? 'document' : 'dataset');
  const jobId = createId('job');
  const safeName = safeFilename(filename);
  const stagingDir = path.join(uploadsRoot(orgKey), uploadId);
  ensureDir(stagingDir);
  fs.writeFileSync(
    path.join(stagingDir, 'manifest.json'),
    JSON.stringify({
      uploadId,
      datasetId,
      jobId,
      filename: safeName,
      originalFilename: filename,
      size,
      kind,
      uploadedBytes: 0,
      chunkSize: CHUNK_SIZE_BYTES,
      createdAt: new Date().toISOString(),
    }, null, 2),
    'utf8'
  );

  if (kind === 'dataset') {
    const dataset: ServerDatasetSummary = {
      id: datasetId,
      name: safeName,
      fileKind: path.extname(safeName).toLowerCase() === '.csv' ? 'csv' : 'excel',
      uploadedAt: new Date().toISOString(),
      fileSizeBytes: size,
      storageMode: 'server',
      status: 'uploading',
      rowCount: 0,
      columnCount: 0,
      schema: [],
      parseErrors: [],
      mappingCompleteness: 0,
      labelColumnMapped: false,
      labelMode: 'derived_only',
      derivedLabelField: 'derived_risk_label',
      derivedLabelGenerated: false,
      availableSheets: [],
      selectedFeatures: [],
      usableFeatureCount: 0,
      analysisReadiness: 'waiting_for_upload',
      latestJobId: jobId,
      quality: {
        duplicateRows: 0,
        invalidTimestamps: 0,
        nullHeavyColumns: [],
        invalidAmountRows: 0,
        negativeAmountRows: 0,
        unsupportedSchemaWarnings: [],
        highCardinalityColumns: [],
        lowCardinalityColumns: [],
      },
      statistics: {
        averageAmount: null,
        maxAmount: null,
      },
      chartSummary: {
        amountDistribution: [],
        transactionTimeDistribution: [],
        featureCorrelation: [],
      },
    };
    workspace.datasets = [dataset, ...workspace.datasets.filter((item) => item.id !== datasetId)];
    workspace.activeDatasetId = datasetId;
  }

  const job: FraudJob = {
    id: jobId,
    datasetId: kind === 'dataset' ? datasetId : undefined,
    type: 'upload',
    status: 'uploading',
    progressPct: 0,
    startedAt: new Date().toISOString(),
    uploadedBytes: 0,
    totalBytes: size,
    resumableKey: uploadId,
  };
  workspace.jobs = [job, ...workspace.jobs.filter((item) => item.id !== jobId)];
  appendAudit(workspace, {
    actor: 'investigator@console',
    action: 'upload_started',
    resource: safeName,
    details: { dataset_id: datasetId, job_id: jobId, size },
  });
  writeWorkspace(orgKey, workspace);

  return {
    uploadId,
    jobId,
    datasetId,
    chunkSize: CHUNK_SIZE_BYTES,
    uploadUrl: `/api/fraud/upload/${uploadId}`,
    completeUrl: `/api/fraud/upload/${uploadId}/complete`,
  };
}

export function readUploadManifest(orgKey: string, uploadId: string) {
  const manifestPath = path.join(uploadsRoot(orgKey), uploadId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw { status: 404, code: 'UPLOAD_NOT_FOUND', message: 'Upload session not found.' };
  return {
    path: manifestPath,
    data: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      uploadId: string;
      datasetId: string;
      jobId: string;
      filename: string;
      originalFilename: string;
      size: number;
      kind: 'dataset' | 'pdf';
      uploadedBytes: number;
      chunkSize: number;
      createdAt: string;
      completedAt?: string;
      cancelledAt?: string;
    },
  };
}

export function writeUploadManifest(manifestPath: string, data: unknown) {
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf8');
}

export function updateJob(orgKey: string, jobId: string, updater: (job: FraudJob, workspace: FraudServerWorkspace) => void) {
  const workspace = ensureWorkspace(orgKey);
  const job = workspace.jobs.find((item) => item.id === jobId);
  if (!job) throw { status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found.' };
  updater(job, workspace);
  writeWorkspace(orgKey, workspace);
  return job;
}

export function spawnBackgroundWorker(orgKey: string, jobId: string, command: 'parse' | 'analyze' | 'report', datasetId: string) {
  const scriptPath = path.join(process.cwd(), 'scripts', 'fraud-job-runner.cjs');
  const child = spawn(process.execPath, [scriptPath, command, orgKey, jobId, datasetId], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });
  child.unref();
}

export function datasetArtifacts(orgKey: string, datasetId: string) {
  const base = path.join(datasetsRoot(orgKey), datasetId);
  ensureDir(base);
  return {
    base,
    sourcePath: path.join(base, 'source'),
    summaryPath: path.join(base, 'summary.json'),
    flaggedPath: path.join(base, 'flagged.json'),
    casesPath: path.join(base, 'cases.json'),
    flaggedCsvPath: path.join(base, 'flagged.csv'),
  };
}

export function reportArtifacts(orgKey: string, reportId: string) {
  const base = path.join(reportsRoot(orgKey), reportId);
  ensureDir(base);
  return {
    base,
    workbookPath: path.join(base, 'fraud_report.xlsx'),
  };
}

export function resolveReportPath(orgKey: string, reportId: string, filename: string) {
  return path.join(reportsRoot(orgKey), reportId, safeFilename(filename));
}

export function listPaged<T>(rows: T[], page: number, pageSize: number) {
  const offset = Math.max(0, (page - 1) * pageSize);
  return {
    page,
    pageSize,
    total: rows.length,
    rows: rows.slice(offset, offset + pageSize),
  };
}

export function listUploadSessions(orgKey: string): FraudUploadSessionStatus[] {
  ensureWorkspace(orgKey);
  const workspace = readWorkspace(orgKey);
  const root = uploadsRoot(orgKey);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .map((uploadId) => {
      try {
        const { data } = readUploadManifest(orgKey, uploadId);
        const job = workspace.jobs.find((item) => item.id === data.jobId);
        return {
          uploadId: data.uploadId,
          datasetId: data.datasetId,
          jobId: data.jobId,
          kind: data.kind,
          filename: data.filename,
          originalFilename: data.originalFilename,
          size: data.size,
          uploadedBytes: data.uploadedBytes,
          chunkSize: data.chunkSize,
          createdAt: data.createdAt,
          completedAt: data.completedAt,
          cancelledAt: data.cancelledAt,
          status: job?.status ?? (data.cancelledAt ? 'cancelled' : data.completedAt ? 'uploaded' : 'uploading'),
        } as FraudUploadSessionStatus;
      } catch {
        return null;
      }
    })
    .filter((item): item is FraudUploadSessionStatus => Boolean(item))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function cancelUploadSession(orgKey: string, uploadId: string) {
  const { path: manifestPath, data } = readUploadManifest(orgKey, uploadId);
  const workspace = ensureWorkspace(orgKey);
  data.cancelledAt = new Date().toISOString();
  writeUploadManifest(manifestPath, data);
  const uploadDir = path.dirname(manifestPath);
  for (const file of fs.readdirSync(uploadDir)) {
    if (file.endsWith('.part')) {
      fs.rmSync(path.join(uploadDir, file), { force: true });
    }
  }
  const job = workspace.jobs.find((item) => item.id === data.jobId);
  if (job) {
    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    job.progressPct = job.uploadedBytes && job.totalBytes ? Math.round((job.uploadedBytes / job.totalBytes) * 100) : job.progressPct;
  }
  const dataset = workspace.datasets.find((item) => item.id === data.datasetId);
  if (dataset && dataset.status === 'uploading') {
    dataset.status = 'failed';
    dataset.analysisReadiness = 'waiting_for_upload';
  }
  appendAudit(workspace, {
    actor: 'investigator@console',
    action: 'upload_cancelled',
    resource: data.filename,
    details: { dataset_id: data.datasetId, upload_id: uploadId, job_id: data.jobId },
  });
  writeWorkspace(orgKey, workspace);
  return { uploadId, jobId: data.jobId, datasetId: data.datasetId, cancelledAt: data.cancelledAt };
}

export function cancelJob(orgKey: string, jobId: string) {
  const workspace = ensureWorkspace(orgKey);
  const job = workspace.jobs.find((item) => item.id === jobId);
  if (!job) throw { status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found.' };
  job.status = 'cancelled';
  job.finishedAt = new Date().toISOString();
  const dataset = job.datasetId ? workspace.datasets.find((item) => item.id === job.datasetId) : undefined;
  if (dataset && ['parsing', 'ready_for_analysis', 'analysis_ready'].includes(dataset.analysisReadiness)) {
    dataset.analysisReadiness = 'waiting_for_mapping';
  }
  appendAudit(workspace, {
    actor: 'investigator@console',
    action: 'job_cancelled',
    resource: job.type,
    details: { job_id: jobId, dataset_id: job.datasetId ?? '' },
  });
  writeWorkspace(orgKey, workspace);
  return job;
}

export function deleteDatasetDeep(orgKey: string, datasetId: string, actor = 'investigator@console') {
  const workspace = ensureWorkspace(orgKey);
  const dataset = workspace.datasets.find((item) => item.id === datasetId);
  if (!dataset) throw { status: 404, code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' };
  const wasActiveDataset = workspace.activeDatasetId === datasetId;

  const relatedRuns = workspace.runs.filter((item) => item.datasetId === datasetId);
  const relatedCases = workspace.cases.filter((item) => item.datasetId === datasetId);
  const relatedReports = workspace.reports.filter((item) => item.datasetId === datasetId);
  const relatedJobs = workspace.jobs.filter((item) => item.datasetId === datasetId);
  const relatedDocuments = workspace.documents.filter((item) => item.datasetId === datasetId || item.linkedCaseIds.some((caseId) => relatedCases.some((caseRow) => caseRow.id === caseId)));
  const relatedReportIds = new Set(relatedReports.map((item) => item.id));
  const relatedCaseIds = new Set(relatedCases.map((item) => item.id));
  const uploadRoot = uploadsRoot(orgKey);

  workspace.datasets = workspace.datasets.filter((item) => item.id !== datasetId);
  workspace.runs = workspace.runs.filter((item) => item.datasetId !== datasetId);
  workspace.cases = workspace.cases.filter((item) => item.datasetId !== datasetId);
  workspace.jobs = workspace.jobs.filter((item) => item.datasetId !== datasetId);
  workspace.reports = workspace.reports.filter((item) => item.datasetId !== datasetId);
  workspace.documents = workspace.documents.filter((item) => item.datasetId !== datasetId && !item.linkedCaseIds.some((caseId) => relatedCaseIds.has(caseId)));
  if (workspace.activeDatasetId === datasetId) {
    workspace.activeDatasetId = workspace.datasets[0]?.id;
  }

  appendAudit(workspace, {
    actor,
    action: 'dataset_deleted',
    resource: dataset.name,
    details: {
      dataset_id: datasetId,
      deletion_mode: 'hard_delete',
      active_dataset: wasActiveDataset,
      runs_removed: relatedRuns.length,
      cases_removed: relatedCases.length,
      reports_removed: relatedReports.length,
      jobs_removed: relatedJobs.length,
      documents_removed: relatedDocuments.length,
    },
  });
  writeWorkspace(orgKey, workspace);

  const artifacts = datasetArtifacts(orgKey, datasetId);
  if (fs.existsSync(artifacts.base)) {
    fs.rmSync(artifacts.base, { recursive: true, force: true });
  }
  for (const report of relatedReports) {
    const reportDir = path.join(reportsRoot(orgKey), report.id);
    if (fs.existsSync(reportDir)) {
      fs.rmSync(reportDir, { recursive: true, force: true });
    }
  }
  if (fs.existsSync(uploadRoot)) {
    for (const uploadId of fs.readdirSync(uploadRoot)) {
      try {
        const { path: manifestPath, data } = readUploadManifest(orgKey, uploadId);
        if (data.datasetId === datasetId) {
          fs.rmSync(path.dirname(manifestPath), { recursive: true, force: true });
        }
      } catch {}
    }
  }
  for (const document of relatedDocuments) {
    if (document.extractedTextPath && fs.existsSync(document.extractedTextPath)) {
      fs.rmSync(document.extractedTextPath, { force: true });
    }
  }

  return {
    datasetId,
    datasetName: dataset.name,
    deletionMode: 'hard_delete' as const,
    removed: {
      runs: relatedRuns.length,
      cases: relatedCases.length,
      reports: relatedReports.length,
      jobs: relatedJobs.length,
      documents: relatedDocuments.length,
    },
    nextActiveDatasetId: workspace.activeDatasetId,
    wasActiveDataset,
  };
}
