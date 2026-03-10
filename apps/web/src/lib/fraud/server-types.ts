import type {
  AnalystDisposition,
  AuditEvent,
  FraudCanonicalField,
  FraudMetrics,
  ParseError,
  RuleHit,
  SchemaFieldProfile,
  WorkspaceSettings,
} from './types';

export type FraudJobStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'parsing'
  | 'waiting_for_mapping'
  | 'ready_for_analysis'
  | 'analyzing'
  | 'report_generating'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type FraudStorageMode = 'browser' | 'server';

export type FraudDataQuality = {
  duplicateRows: number;
  invalidTimestamps: number;
  nullHeavyColumns: Array<{ column: string; nullRate: number }>;
  invalidAmountRows: number;
  negativeAmountRows: number;
  unsupportedSchemaWarnings: string[];
  insufficientFeatureWarning?: string;
  highCardinalityColumns: Array<{ column: string; distinctEstimate: number }>;
  lowCardinalityColumns: Array<{ column: string; distinctEstimate: number }>;
};

export type ServerDatasetSummary = {
  id: string;
  name: string;
  fileKind: 'csv' | 'excel' | 'pdf';
  uploadedAt: string;
  fileSizeBytes: number;
  storageMode: FraudStorageMode;
  status: 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'archived';
  rowCount: number;
  columnCount: number;
  selectedSheet?: string;
  schema: SchemaFieldProfile[];
  parseErrors: ParseError[];
  mappingCompleteness: number;
  labelColumn?: string;
  labelColumnMapped: boolean;
  labelMode: 'ground_truth' | 'derived_only';
  derivedLabelField?: string;
  derivedLabelGenerated: boolean;
  availableSheets: string[];
  selectedFeatures?: string[];
  usableFeatureCount: number;
  analysisReadiness: 'waiting_for_upload' | 'parsing' | 'waiting_for_mapping' | 'ready_for_analysis' | 'analysis_blocked' | 'analysis_ready';
  latestJobId?: string;
  latestRunId?: string;
  quality: FraudDataQuality;
  statistics?: {
    timeSpanStart?: string;
    timeSpanEnd?: string;
    uniqueCustomers?: number;
    uniqueMerchants?: number;
    averageAmount?: number | null;
    maxAmount?: number | null;
  };
  chartSummary?: {
    amountDistribution: Array<{ bucket: string; count: number }>;
    transactionTimeDistribution: Array<{ bucket: string; count: number }>;
    featureCorrelation: Array<{ featureX: string; featureY: string; correlation: number }>;
  };
  stagedPath?: string;
  derivedPath?: string;
};

export type FraudJob = {
  id: string;
  datasetId?: string;
  reportId?: string;
  type: 'upload' | 'parse' | 'analysis' | 'report';
  status: FraudJobStatus;
  progressPct: number;
  startedAt: string;
  finishedAt?: string;
  failureReason?: string;
  uploadedBytes?: number;
  totalBytes?: number;
  canRetry?: boolean;
  resumableKey?: string;
};

export type ServerFlaggedRow = {
  id: string;
  transactionId: string;
  customerId?: string;
  merchantId?: string;
  deviceId?: string;
  location?: string;
  amount?: number | null;
  timestamp?: string | null;
  combinedRiskScore: number;
  anomalyScore: number;
  riskBand: 'critical' | 'high' | 'medium' | 'low';
  suspicious: boolean;
  whyFlagged: string[];
  whyLegit: string[];
  finalRecommendation: string;
  recommendedAction: string;
  ruleHits: RuleHit[];
  confidenceLevel: 'high' | 'medium' | 'low';
  uncertaintyNote: string;
  fraudLabel?: boolean;
  derivedRiskLabel: 'high_risk' | 'medium_risk' | 'low_risk';
  labelSource: 'ground_truth' | 'derived_only';
  investigationStatus?: 'new' | 'under_investigation' | 'confirmed_fraud' | 'false_positive' | 'closed';
  linkedCaseId?: string;
  evidenceLinks?: Array<{ type: 'note' | 'document' | 'screenshot_reference'; value: string; at: string }>;
};

export type ServerCaseRecord = {
  id: string;
  datasetId: string;
  title: string;
  createdAt: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: AnalystDisposition;
  recordId: string;
  transactionId: string;
  customerId?: string;
  merchantId?: string;
  amount?: number | null;
  combinedRiskScore: number;
  anomalyScore: number;
  whyFlagged: string[];
  whyLegit: string[];
  finalRecommendation: string;
  recommendedAction: string;
  ruleHits: RuleHit[];
  linkedDocumentIds: string[];
  note?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  caseLabelSource: 'ground_truth' | 'derived_only';
  derivedRiskLabel: 'high_risk' | 'medium_risk' | 'low_risk';
  dispositionHistory: Array<{ at: string; actor: string; disposition: AnalystDisposition; note?: string }>;
};

export type ServerEvidenceDocument = {
  id: string;
  datasetId?: string;
  name: string;
  uploadedAt: string;
  size: number;
  parseStatus: 'parsed' | 'image_only_or_unparsed' | 'error';
  snippet: string;
  extractedTextPath?: string;
  linkedCaseIds: string[];
  linkedRecordIds: string[];
};

export type ServerReportRecord = {
  id: string;
  datasetId: string;
  generatedAt: string;
  filename: string;
  format: 'xlsx';
  sampleFlaggedRows: number;
  fullFlaggedExportPath?: string;
};

export type ServerAnalysisRun = {
  id: string;
  datasetId: string;
  startedAt: string;
  completedAt?: string;
  status: FraudJobStatus;
  algorithm: 'streaming_hybrid_anomaly';
  threshold: number;
  contamination: number;
  featuresUsed: string[];
  metrics: FraudMetrics;
  anomaliesByDay: Array<{ bucket: string; count: number }>;
  anomalyScoreDistribution: Array<{ bucket: string; count: number }>;
  riskBandDistribution: Array<{ band: string; count: number; amount: number | null }>;
  topRiskEntities: Array<{ entityType: string; value: string; suspiciousCount: number; suspiciousAmount: number | null }>;
  decisionSummary: Array<{ label: string; count: number }>;
  reportGenerated: boolean;
  reasonBreakdown: Array<{ reason: string; count: number }>;
  ruleHitDistribution: Array<{ ruleId: string; label: string; count: number }>;
};

export type FraudServerWorkspace = {
  version: 2;
  orgKey: string;
  orgName: string;
  activeDatasetId?: string;
  settings: WorkspaceSettings;
  datasets: ServerDatasetSummary[];
  jobs: FraudJob[];
  runs: ServerAnalysisRun[];
  cases: ServerCaseRecord[];
  documents: ServerEvidenceDocument[];
  reports: ServerReportRecord[];
  auditEvents: AuditEvent[];
  settingsHistory?: Array<{
    id: string;
    at: string;
    actor: string;
    previous: WorkspaceSettings;
    next: WorkspaceSettings;
  }>;
  updatedAt: string;
};

export type FraudPagedResult<T> = {
  page: number;
  pageSize: number;
  total: number;
  rows: T[];
};

export type AuditCategory = 'DATA EVENTS' | 'ANALYSIS EVENTS' | 'REPORT EVENTS' | 'USER ACTIONS' | 'SECURITY EVENTS';
export type AuditSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'SECURITY';

export type ServerAuditEvent = {
  id: string;
  at: string;
  action: string;
  actor: string;
  resource: string;
  details?: Record<string, string | number | boolean | null>;
  category: AuditCategory;
  severity: AuditSeverity;
};

export type FlaggedQuery = {
  query?: string;
  riskBand?: string;
  confidence?: string;
  minAmount?: number;
  maxAmount?: number;
  merchant?: string;
  customer?: string;
  timeFrom?: string;
  timeTo?: string;
  sortBy?: 'anomalyScore' | 'combinedRiskScore' | 'amount' | 'timestamp';
  sortDir?: 'asc' | 'desc';
};

export type FlaggedDetailResponse = {
  row: ServerFlaggedRow | null;
  customerHistory: ServerFlaggedRow[];
  deviceHistory: ServerFlaggedRow[];
  relatedTransactions: ServerFlaggedRow[];
  merchantProfile: {
    merchantId?: string;
    suspiciousCount: number;
    suspiciousAmount: number;
  };
};

export type FraudWorkspaceResponse = {
  workspace: FraudServerWorkspace;
  permissions?: {
    canDeleteDatasets: boolean;
    role: string;
    authenticated: boolean;
  };
};

export type FraudUploadInitResponse = {
  uploadId: string;
  jobId: string;
  datasetId: string;
  chunkSize: number;
  uploadUrl: string;
  completeUrl: string;
};

export type FraudUploadSessionStatus = {
  uploadId: string;
  datasetId: string;
  jobId: string;
  kind: 'dataset' | 'pdf';
  filename: string;
  originalFilename: string;
  size: number;
  uploadedBytes: number;
  chunkSize: number;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  status: FraudJobStatus;
};

export type FraudJobResponse = {
  job: FraudJob;
  dataset?: ServerDatasetSummary;
};

export type FraudDatasetMutation = {
  datasetId: string;
  active?: boolean;
  mapping?: Array<{ columnName: string; mappedTo?: FraudCanonicalField }>;
  selectedFeatures?: string[];
  labelColumn?: string;
  selectedSheet?: string;
};
