export type FraudCanonicalField =
  | 'transaction_id'
  | 'customer_id'
  | 'merchant_id'
  | 'amount'
  | 'timestamp'
  | 'location'
  | 'ip_address'
  | 'device_id'
  | 'payment_method'
  | 'fraud_label'
  | 'status';

export type FileKind = 'csv' | 'excel' | 'pdf';
export type DatasetStatus = 'ready' | 'error';
export type PdfParseStatus = 'parsed' | 'image_only_or_unparsed' | 'error';

export type SchemaFieldProfile = {
  name: string;
  mappedTo?: FraudCanonicalField;
  dataType: 'numeric' | 'datetime' | 'boolean' | 'text' | 'empty' | 'mixed';
  sampleValues: string[];
  nonEmptyCount: number;
};

export type ParseError = {
  row?: number;
  message: string;
};

export type TransactionRecord = {
  id: string;
  rowNumber: number;
  values: Record<string, string | number | boolean | null>;
  normalized: Partial<Record<FraudCanonicalField, string | number | boolean | null>>;
};

export type UploadedDataset = {
  id: string;
  name: string;
  fileKind: Extract<FileKind, 'csv' | 'excel'>;
  uploadedAt: string;
  rowCount: number;
  columnCount: number;
  status: DatasetStatus;
  parseErrors: ParseError[];
  availableSheets: string[];
  selectedSheet?: string;
  schema: SchemaFieldProfile[];
  records: TransactionRecord[];
};

export type UploadedDocument = {
  id: string;
  name: string;
  uploadedAt: string;
  size: number;
  parseStatus: PdfParseStatus;
  snippet: string;
  extractedText?: string;
  linkedDatasetId?: string;
  linkedCaseIds: string[];
  linkedRecordIds: string[];
};

export type FlaggedRecord = {
  recordId: string;
  anomalyScore: number;
  combinedRiskScore: number;
  riskScore: number;
  suspicious: boolean;
  riskBand: 'critical' | 'high' | 'medium' | 'low';
  reasons: string[];
  features: Record<string, number>;
  ruleHits: RuleHit[];
  whyFlagged: string[];
  whyLegit: string[];
  finalRecommendation: string;
  recommendedAction: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  uncertaintyNote: string;
  decisionDrivers: Array<'anomaly_model' | 'rules' | 'fraud_label' | 'analyst_review'>;
  fraudLabel?: boolean;
};

export type RuleHit = {
  ruleId: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
  scoreImpact: number;
  explanation: string;
};

export type FraudMetrics = {
  totalTransactions: number;
  suspiciousTransactions: number;
  anomalyRate: number | null;
  fraudRate: number | null;
  derivedHighRiskRate: number | null;
  totalAmount: number | null;
  highRiskExposure: number | null;
  suspiciousAmount: number | null;
  labeledFraudCount: number | null;
  anomalyFraudOverlap: number | null;
  derivedLabelCounts: {
    high_risk: number;
    medium_risk: number;
    low_risk: number;
  };
  labelMode: 'ground_truth' | 'derived_only';
  derivedLabelField?: string;
  sourceLabelAvailable: boolean;
  labelExplanation: string;
  confirmedFraudCases: number;
  falsePositiveCases: number;
  underReviewCases: number;
};

export type AnalysisRun = {
  id: string;
  datasetId: string;
  startedAt: string;
  completedAt: string;
  algorithm: 'isolation_forest';
  threshold: number;
  contamination: number;
  featuresUsed: string[];
  flaggedRecords: FlaggedRecord[];
  metrics: FraudMetrics;
  anomaliesByDay: Array<{ bucket: string; count: number }>;
  topRiskEntities: Array<{ entityType: string; value: string; suspiciousCount: number; suspiciousAmount: number | null }>;
  entityRiskBreakdown: Array<{ entityType: string; value: string; suspiciousCount: number }>;
  reportGenerated: boolean;
};

export type AnalystDisposition = 'new' | 'under_review' | 'escalated' | 'confirmed_fraud' | 'false_positive' | 'closed';

export type DispositionEvent = {
  at: string;
  actor: string;
  disposition: AnalystDisposition;
  note?: string;
};

export type FraudCase = {
  id: string;
  title: string;
  createdAt: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: AnalystDisposition;
  recordId: string;
  datasetId: string;
  anomalyScore: number;
  combinedRiskScore: number;
  riskScore: number;
  reasons: string[];
  whyFlagged: string[];
  whyLegit: string[];
  ruleHits: RuleHit[];
  finalRecommendation: string;
  recommendedAction: string;
  linkedDocumentIds: string[];
  note?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  dispositionHistory: DispositionEvent[];
};

export type AuditEvent = {
  id: string;
  at: string;
  action: string;
  actor: string;
  resource: string;
  details?: Record<string, string | number | boolean | null>;
};

export type WorkspaceSettings = {
  anomalyThreshold: number;
  contamination: number;
  selectedSheet?: string;
  enabledRules: Array<'high_amount' | 'unusual_hour' | 'new_device_high_amount' | 'new_location_high_amount' | 'rapid_repeat' | 'risky_merchant_cluster'>;
  highAmountThreshold: number;
  unusualHourStart: number;
  unusualHourEnd: number;
  rapidRepeatTransactionCount: number;
  rapidRepeatWindowMinutes: number;
  merchantClusterSize: number;
  deviceChangeWindowMinutes: number;
  derivedHighRiskThreshold: number;
  derivedMediumRiskThreshold: number;
  riskBands: {
    critical: number;
    high: number;
    medium: number;
  };
};

export type GeneratedReport = {
  id: string;
  datasetId: string;
  generatedAt: string;
  filename: string;
  format: 'xlsx';
};

export type EntityLink = {
  entityType: 'customer_id' | 'merchant_id' | 'device_id' | 'ip_address' | 'location';
  value: string;
  suspiciousCount: number;
  linkedRecordIds: string[];
  linkedCaseIds: string[];
  explanation: string;
};

export type FraudWorkspace = {
  version: 1;
  activeDatasetId?: string;
  datasets: UploadedDataset[];
  documents: UploadedDocument[];
  analysisRuns: AnalysisRun[];
  cases: FraudCase[];
  auditEvents: AuditEvent[];
  reports: GeneratedReport[];
  entityLinks: EntityLink[];
  settings: WorkspaceSettings;
};
