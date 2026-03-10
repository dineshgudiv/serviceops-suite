'use client';

import * as XLSX from 'xlsx';
import {
  PRODUCT_ABSTRACT,
  PRODUCT_CREDITS,
  PRODUCT_DIFFERENTIATOR,
  PRODUCT_NAME,
  PRODUCT_PROBLEM_STATEMENT,
  PRODUCT_VIVA_ANSWER,
  PRODUCT_WHY_BUILT,
} from './content';
import type { FraudCanonicalField, FraudWorkspace, GeneratedReport, UploadedDataset } from './types';

const CANONICAL_LABELS: Record<FraudCanonicalField, string> = {
  transaction_id: 'Transaction ID',
  customer_id: 'Customer ID',
  merchant_id: 'Merchant ID',
  amount: 'Amount',
  timestamp: 'Timestamp',
  location: 'Location',
  ip_address: 'IP Address',
  device_id: 'Device ID',
  payment_method: 'Payment Method',
  fraud_label: 'Fraud Label',
  status: 'Status',
};

function formatFilename(dataset: UploadedDataset) {
  const safeName = dataset.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `fraud_report_${safeName}_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
}

export function createReportMetadata(dataset: UploadedDataset): GeneratedReport {
  return {
    id: `report_${dataset.id}_${Date.now()}`,
    datasetId: dataset.id,
    generatedAt: new Date().toISOString(),
    filename: formatFilename(dataset),
    format: 'xlsx',
  };
}

export function downloadFraudWorkbook(workspace: FraudWorkspace, dataset: UploadedDataset, report: GeneratedReport) {
  const run = workspace.analysisRuns.find((item) => item.datasetId === dataset.id);
  const flaggedById = new Map((run?.flaggedRecords ?? []).map((item) => [item.recordId, item]));

  const summaryRows = [
    { metric: 'Product', value: PRODUCT_NAME },
    { metric: 'Report title', value: 'Fraud Investigation Summary Report' },
    { metric: 'Executive Summary', value: PRODUCT_ABSTRACT },
    { metric: 'Problem Statement', value: PRODUCT_PROBLEM_STATEMENT },
    { metric: 'Why This Platform Was Built', value: PRODUCT_WHY_BUILT },
    { metric: 'What Makes It Different', value: PRODUCT_DIFFERENTIATOR },
    { metric: 'Product Tagline', value: PRODUCT_VIVA_ANSWER },
    { metric: 'Dataset file name', value: dataset.name },
    { metric: 'Sheet used', value: dataset.selectedSheet ?? 'Default sheet' },
    { metric: 'Upload timestamp', value: dataset.uploadedAt },
    { metric: 'Total rows', value: dataset.rowCount },
    { metric: 'Total columns', value: dataset.columnCount },
    { metric: 'Suspicious rows', value: run?.metrics.suspiciousTransactions ?? 0 },
    { metric: 'Anomaly rate', value: run?.metrics.anomalyRate ?? 'Not available' },
    { metric: 'Fraud rate', value: run?.metrics.fraudRate ?? 'Not available' },
    { metric: 'Total amount', value: run?.metrics.totalAmount ?? 'Not available' },
    { metric: 'High-risk exposure', value: run?.metrics.highRiskExposure ?? 'Not available' },
    { metric: 'Top risky entities', value: (run?.topRiskEntities ?? []).slice(0, 5).map((item) => `${item.entityType}: ${item.value}`).join(' | ') || 'None' },
    { metric: 'Recommendations', value: 'Prioritize high-risk cases with multiple rule hits, validate against transaction history, and capture analyst disposition for feedback loop trust.' },
    { metric: 'Credits', value: `${PRODUCT_CREDITS[0]} | ${PRODUCT_CREDITS[1]}` },
  ];

  const flaggedRows = dataset.records
    .filter((record) => flaggedById.get(record.id)?.suspicious)
    .map((record) => {
      const flagged = flaggedById.get(record.id);
      return {
        transaction_id: record.normalized.transaction_id ?? record.id,
        customer_id: record.normalized.customer_id ?? '',
        merchant_id: record.normalized.merchant_id ?? '',
        amount: record.normalized.amount ?? '',
        timestamp: record.normalized.timestamp ?? '',
        anomaly_score: flagged?.anomalyScore ?? '',
        combined_risk_score: flagged?.combinedRiskScore ?? '',
        risk_score: flagged?.riskScore ?? '',
        risk_band: flagged?.riskBand ?? '',
        fraud_label: flagged?.fraudLabel ?? '',
        rule_hits: flagged?.ruleHits.map((item) => item.label).join(' | ') ?? '',
        why_flagged: flagged?.whyFlagged.join(' | ') ?? '',
        why_legit: flagged?.whyLegit.join(' | ') ?? '',
        final_risk_position: flagged?.finalRecommendation ?? '',
        recommended_action: flagged?.recommendedAction ?? '',
      };
    });

  const metricsRows = [
    { metric: 'Total transactions', value: run?.metrics.totalTransactions ?? dataset.rowCount },
    { metric: 'Suspicious transactions', value: run?.metrics.suspiciousTransactions ?? 0 },
    { metric: 'Labeled fraud count', value: run?.metrics.labeledFraudCount ?? 'Not available' },
    { metric: 'Anomaly / fraud overlap', value: run?.metrics.anomalyFraudOverlap ?? 'Not available' },
    { metric: 'Confirmed fraud cases', value: run?.metrics.confirmedFraudCases ?? 0 },
    { metric: 'False positive cases', value: run?.metrics.falsePositiveCases ?? 0 },
    { metric: 'Under review cases', value: run?.metrics.underReviewCases ?? 0 },
    ...(run?.anomaliesByDay ?? []).map((item) => ({ metric: `Anomalies ${item.bucket}`, value: item.count })),
    ...(run?.topRiskEntities ?? []).map((item) => ({ metric: `${item.entityType} ${item.value}`, value: item.suspiciousCount })),
  ];

  const featureMappingRows = dataset.schema.map((field) => ({
    original_column: field.name,
    canonical_field: field.mappedTo ? CANONICAL_LABELS[field.mappedTo] : 'Unmapped',
    detected_type: field.dataType,
    included_in_model: run?.featuresUsed.includes(field.name) ? 'yes' : 'no',
    sample_values: field.sampleValues.join(' | '),
  }));

  const caseRows = workspace.cases
    .filter((item) => item.datasetId === dataset.id)
    .map((item) => ({
      case_id: item.id,
      transaction_id: dataset.records.find((record) => record.id === item.recordId)?.normalized.transaction_id ?? item.recordId,
      severity: item.severity,
      status: item.status,
      anomaly_score: item.anomalyScore,
      combined_risk_score: item.combinedRiskScore,
      risk_score: item.riskScore,
      recommendation: item.finalRecommendation,
      recommended_action: item.recommendedAction,
      reviewed_by: item.reviewedBy ?? '',
      reviewed_at: item.reviewedAt ?? '',
    }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(flaggedRows.length ? flaggedRows : [{ message: 'No suspicious rows in current run' }]), 'Flagged Transactions');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metricsRows), 'Metrics');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(featureMappingRows), 'Feature Mapping');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(caseRows.length ? caseRows : [{ message: 'No cases generated' }]), 'Cases');
  XLSX.writeFile(workbook, report.filename);
}
