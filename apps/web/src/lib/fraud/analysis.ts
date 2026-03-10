import type {
  AnalysisRun,
  EntityLink,
  FlaggedRecord,
  FraudCanonicalField,
  FraudCase,
  FraudMetrics,
  RuleHit,
  TransactionRecord,
  UploadedDataset,
  UploadedDocument,
  WorkspaceSettings,
} from './types';

type FeatureVector = {
  record: TransactionRecord;
  values: number[];
  zSignals: Array<{ key: string; value: number; raw: number }>;
};

type TreeNode =
  | { kind: 'leaf'; size: number }
  | { kind: 'branch'; featureIndex: number; split: number; left: TreeNode; right: TreeNode };

const CANONICAL_DISPLAY: Record<FraudCanonicalField, string> = {
  transaction_id: 'Transaction ID',
  customer_id: 'Customer',
  merchant_id: 'Merchant',
  amount: 'Amount',
  timestamp: 'Timestamp',
  location: 'Location',
  ip_address: 'IP address',
  device_id: 'Device',
  payment_method: 'Payment method',
  fraud_label: 'Fraud label',
  status: 'Status',
};

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[$,%\s,]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTimestampMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function cFactor(size: number) {
  if (size <= 1) return 0;
  return 2 * (Math.log(size - 1) + 0.5772156649) - (2 * (size - 1)) / size;
}

function quantile(sortedValues: number[], percentile: number) {
  if (sortedValues.length === 0) return 0;
  const clamped = Math.max(0, Math.min(1, percentile));
  const index = Math.min(sortedValues.length - 1, Math.floor(clamped * (sortedValues.length - 1)));
  return sortedValues[index];
}

function normalize(values: number[]) {
  if (!values.length) return { mean: 0, stdDev: 1 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) || 1 };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function asBooleanLabel(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'fraud', 'yes', 'y', 'chargeback', 'positive'].includes(normalized)) return true;
  if (['0', 'false', 'legit', 'legitimate', 'no', 'n', 'negative'].includes(normalized)) return false;
  return undefined;
}

function buildFeatureMatrix(dataset: UploadedDataset) {
  const columns = new Map<string, Map<string, number>>();
  const usableColumns = new Set(dataset.schema.filter((field) => field.mappedTo !== 'fraud_label').map((field) => field.name));

  function setFeature(key: string, recordId: string, value: number | null) {
    if (value === null || !Number.isFinite(value)) return;
    if (!columns.has(key)) columns.set(key, new Map());
    columns.get(key)?.set(recordId, value);
  }

  dataset.records.forEach((record) => {
    Object.entries(record.values).forEach(([key, raw]) => {
      if (!usableColumns.has(key)) return;
      setFeature(key, record.id, asNumber(raw));
    });
    const timestamp = toTimestampMillis(record.normalized.timestamp);
    if (timestamp !== null) {
      const date = new Date(timestamp);
      setFeature('hour_of_day', record.id, date.getUTCHours());
      setFeature('day_of_week', record.id, date.getUTCDay());
      setFeature('day_of_month', record.id, date.getUTCDate());
      setFeature('timestamp_ms', record.id, timestamp);
    }
  });

  const selectedColumns = [...columns.entries()]
    .map(([key, valueByRecord]) => ({ key, valueByRecord, values: [...valueByRecord.values()] }))
    .filter((column) => column.values.length >= Math.max(8, Math.floor(dataset.records.length * 0.2)));

  const medians = selectedColumns.map((column) => median(column.values));
  const stats = selectedColumns.map((column) => ({ key: column.key, ...normalize(column.values), values: column.valueByRecord }));

  const vectors: FeatureVector[] = dataset.records.map((record) => ({
    record,
    values: selectedColumns.map((column, index) => column.valueByRecord.get(record.id) ?? medians[index]),
    zSignals: stats
      .map((column, index) => {
        const raw = selectedColumns[index].valueByRecord.get(record.id);
        if (raw === undefined) return null;
        const z = Math.abs((raw - column.mean) / column.stdDev);
        return { key: column.key, value: z, raw };
      })
      .filter((item): item is { key: string; value: number; raw: number } => Boolean(item)),
  }));

  return { featureNames: selectedColumns.map((column) => column.key), vectors };
}

function buildIsolationTree(points: number[][], depth: number, maxDepth: number, random: () => number): TreeNode {
  if (depth >= maxDepth || points.length <= 1) return { kind: 'leaf', size: points.length };
  const candidateIndexes = points[0]
    .map((_, index) => index)
    .filter((index) => {
      const values = points.map((point) => point[index]);
      return Math.max(...values) > Math.min(...values);
    });
  if (!candidateIndexes.length) return { kind: 'leaf', size: points.length };
  const featureIndex = candidateIndexes[Math.floor(random() * candidateIndexes.length)];
  const values = points.map((point) => point[featureIndex]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const split = min + (max - min) * random();
  const leftPoints = points.filter((point) => point[featureIndex] < split);
  const rightPoints = points.filter((point) => point[featureIndex] >= split);
  if (!leftPoints.length || !rightPoints.length) return { kind: 'leaf', size: points.length };
  return {
    kind: 'branch',
    featureIndex,
    split,
    left: buildIsolationTree(leftPoints, depth + 1, maxDepth, random),
    right: buildIsolationTree(rightPoints, depth + 1, maxDepth, random),
  };
}

function pathLength(node: TreeNode, point: number[], depth = 0): number {
  if (node.kind === 'leaf') return depth + cFactor(node.size);
  if (point[node.featureIndex] < node.split) return pathLength(node.left, point, depth + 1);
  return pathLength(node.right, point, depth + 1);
}

function buildPeerHistory(records: TransactionRecord[]) {
  const customerMerchantCounts = new Map<string, number>();
  const customerAmounts = new Map<string, number[]>();
  const customerDevices = new Map<string, Set<string>>();
  const customerLocations = new Map<string, Set<string>>();
  const entityCounts = new Map<string, number>();

  records.forEach((record) => {
    const customer = String(record.normalized.customer_id ?? '');
    const merchant = String(record.normalized.merchant_id ?? '');
    const device = String(record.normalized.device_id ?? '');
    const location = String(record.normalized.location ?? '');
    const amount = asNumber(record.normalized.amount);
    const timestamp = toTimestampMillis(record.normalized.timestamp);
    if (customer && merchant) customerMerchantCounts.set(`${customer}:${merchant}`, (customerMerchantCounts.get(`${customer}:${merchant}`) ?? 0) + 1);
    if (customer && amount !== null) {
      const arr = customerAmounts.get(customer) ?? [];
      arr.push(amount);
      customerAmounts.set(customer, arr);
    }
    if (customer && device) {
      const set = customerDevices.get(customer) ?? new Set<string>();
      set.add(device);
      customerDevices.set(customer, set);
    }
    if (customer && location) {
      const set = customerLocations.get(customer) ?? new Set<string>();
      set.add(location);
      customerLocations.set(customer, set);
    }
    if (timestamp !== null) entityCounts.set(`minute:${Math.floor(timestamp / 60000)}`, (entityCounts.get(`minute:${Math.floor(timestamp / 60000)}`) ?? 0) + 1);
  });

  return { customerMerchantCounts, customerAmounts, customerDevices, customerLocations, entityCounts };
}

function evaluateRules(record: TransactionRecord, dataset: UploadedDataset, settings: WorkspaceSettings, peerHistory: ReturnType<typeof buildPeerHistory>): RuleHit[] {
  const hits: RuleHit[] = [];
  const enabledRules = settings.enabledRules ?? [];
  const amount = asNumber(record.normalized.amount) ?? 0;
  const timestamp = toTimestampMillis(record.normalized.timestamp);
  const customer = String(record.normalized.customer_id ?? '');
  const merchant = String(record.normalized.merchant_id ?? '');
  const device = String(record.normalized.device_id ?? '');
  const location = String(record.normalized.location ?? '');

  if (enabledRules.includes('high_amount') && amount >= settings.highAmountThreshold) {
    hits.push({ ruleId: 'high_amount', label: 'High amount threshold', severity: 'high', scoreImpact: 18, explanation: `Amount ${amount} exceeded configured threshold ${settings.highAmountThreshold}.` });
  }

  if (timestamp !== null) {
    const hour = new Date(timestamp).getUTCHours();
    const unusualHour = settings.unusualHourStart <= settings.unusualHourEnd
      ? hour >= settings.unusualHourStart && hour <= settings.unusualHourEnd
      : hour >= settings.unusualHourStart || hour <= settings.unusualHourEnd;
    if (enabledRules.includes('unusual_hour') && unusualHour) {
      hits.push({ ruleId: 'unusual_hour', label: 'Unusual transaction hour', severity: 'medium', scoreImpact: 10, explanation: `Transaction hour ${hour}:00 UTC falls in the unusual-hour watch window.` });
    }
  }

  if (enabledRules.includes('new_device_high_amount') && customer && device && amount >= settings.highAmountThreshold * 0.65) {
    const knownDevices = peerHistory.customerDevices.get(customer) ?? new Set<string>();
    if (!knownDevices.has(device) || knownDevices.size <= 1) {
      hits.push({ ruleId: 'new_device_high_amount', label: 'New device with high amount', severity: 'high', scoreImpact: 14, explanation: 'Customer-device history is sparse and the amount is elevated.' });
    }
  }

  if (enabledRules.includes('new_location_high_amount') && customer && location && amount >= settings.highAmountThreshold * 0.65) {
    const knownLocations = peerHistory.customerLocations.get(customer) ?? new Set<string>();
    if (!knownLocations.has(location) || knownLocations.size <= 1) {
      hits.push({ ruleId: 'new_location_high_amount', label: 'New location with high amount', severity: 'medium', scoreImpact: 12, explanation: 'The customer rarely transacts from this location and the amount is elevated.' });
    }
  }

  if (enabledRules.includes('rapid_repeat') && timestamp !== null) {
    const minuteKey = `minute:${Math.floor(timestamp / 60000)}`;
    if ((peerHistory.entityCounts.get(minuteKey) ?? 0) >= 3) {
      hits.push({ ruleId: 'rapid_repeat', label: 'Rapid repeat activity', severity: 'medium', scoreImpact: 9, explanation: 'Multiple transactions occurred in the same minute bucket.' });
    }
  }

  if (enabledRules.includes('risky_merchant_cluster') && merchant) {
    const merchantFrequency = dataset.records.filter((item) => String(item.normalized.merchant_id ?? '') === merchant).length;
    const chargebackFrequency = dataset.records.filter((item) => String(item.normalized.merchant_id ?? '') === merchant && asBooleanLabel(item.normalized.fraud_label)).length;
    if (merchantFrequency >= 2 && chargebackFrequency >= 1) {
      hits.push({ ruleId: 'risky_merchant_cluster', label: 'Risky merchant cluster', severity: 'medium', scoreImpact: 11, explanation: 'This merchant appears repeatedly with at least one labeled fraud/chargeback record.' });
    }
  }

  return hits;
}

function deriveDecisionNarrative(
  record: TransactionRecord,
  anomalyScore: number,
  combinedRiskScore: number,
  ruleHits: RuleHit[],
  zSignals: Array<{ key: string; value: number }>,
  peerHistory: ReturnType<typeof buildPeerHistory>,
  fraudLabel?: boolean
) {
  const whyFlagged: string[] = [];
  const whyLegit: string[] = [];
  const amount = asNumber(record.normalized.amount);
  const customer = String(record.normalized.customer_id ?? '');
  const merchant = String(record.normalized.merchant_id ?? '');
  const device = String(record.normalized.device_id ?? '');
  const location = String(record.normalized.location ?? '');
  const timestamp = toTimestampMillis(record.normalized.timestamp);
  const merchantHistoryCount = customer && merchant ? peerHistory.customerMerchantCounts.get(`${customer}:${merchant}`) ?? 0 : 0;

  if (amount !== null && customer) {
    const history = peerHistory.customerAmounts.get(customer) ?? [];
    if (history.length >= 2) {
      const avgAmount = history.reduce((sum, value) => sum + value, 0) / history.length;
      if (avgAmount > 0 && amount >= avgAmount * 1.75) {
        whyFlagged.push('Transaction amount is significantly higher than the customer’s normal pattern.');
      }
    }
  }

  if (timestamp !== null) {
    const hour = new Date(timestamp).getUTCHours();
    if (hour <= 5 || hour >= 23) {
      whyFlagged.push('Transaction occurred at an unusual hour compared with historical activity.');
    }
  }

  if (device && location && customer) {
    const knownDevices = peerHistory.customerDevices.get(customer) ?? new Set<string>();
    const knownLocations = peerHistory.customerLocations.get(customer) ?? new Set<string>();
    if ((!knownDevices.has(device) || knownDevices.size <= 1) && (!knownLocations.has(location) || knownLocations.size <= 1)) {
      whyFlagged.push('A new device and unfamiliar location were used together.');
    }
  }

  zSignals
    .filter((item) => item.value >= 1.15)
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .forEach((item) => whyFlagged.push(`Model-based anomaly: ${item.key.replace(/_/g, ' ')} deviates from peer behavior.`));
  ruleHits.forEach((rule) => whyFlagged.push(`Rule-based signal: ${rule.explanation}`));
  if (anomalyScore >= 0.7) whyFlagged.push('The anomaly score exceeded the configured threshold.');
  if (ruleHits.length >= 2) whyFlagged.push(`${ruleHits.length} additional fraud rules were triggered.`);
  if (!whyFlagged.length) whyFlagged.push('Only a weak anomaly signature is present.');

  if (merchantHistoryCount >= 2) {
    whyLegit.push('The merchant has appeared in the customer’s past transaction history.');
  }
  if (customer && amount !== null) {
    const history = peerHistory.customerAmounts.get(customer) ?? [];
    if (history.length >= 2) {
      const maxAmount = Math.max(...history);
      if (amount <= maxAmount) whyLegit.push('Amount is high but still within the customer’s historical range.');
    }
  }
  if (zSignals.filter((item) => item.value >= 1.15).length <= 1) {
    whyLegit.push('Only one behavioral pattern is strongly abnormal; others are moderate.');
  }
  if (fraudLabel === undefined) whyLegit.push('No confirmed fraud label is available for this transaction.');
  if (!whyLegit.some((item) => item.includes('source confirmation'))) {
    whyLegit.push('There is currently no additional source confirmation proving malicious intent.');
  }
  if (!whyLegit.length) whyLegit.push('Current context does not confirm fraud; analyst review is still required.');

  let finalRecommendation = 'Low Confidence Suspicion';
  if (combinedRiskScore >= 85) finalRecommendation = 'High Risk — Immediate Review';
  else if (combinedRiskScore >= 65) finalRecommendation = 'Medium-High Risk — Analyst Review Recommended';
  else if (combinedRiskScore >= 45) finalRecommendation = 'Low Confidence Suspicion';
  else finalRecommendation = 'Likely Legitimate but Monitor';

  let recommendedAction = 'Review recent customer history and verify device/location consistency before marking as confirmed fraud.';
  if (combinedRiskScore >= 85) {
    recommendedAction = 'Escalate immediately and verify customer/device/location consistency before confirming fraud.';
  } else if (combinedRiskScore < 45) {
    recommendedAction = 'Monitor the record and compare against recent customer history before closing as legitimate.';
  }

  const confidenceLevel = combinedRiskScore >= 80 || ruleHits.length >= 3 ? 'high' : combinedRiskScore >= 55 ? 'medium' : 'low';
  const uncertaintyNote =
    fraudLabel === true
      ? 'True fraud label present in the dataset, but this still requires workflow confirmation.'
      : ruleHits.length === 0
      ? 'Decision is mostly anomaly-model driven with limited supporting rules.'
      : 'Decision combines heuristic rules and anomaly-model behavior; analyst feedback should confirm outcome.';

  const decisionDrivers: Array<'anomaly_model' | 'rules' | 'fraud_label' | 'analyst_review'> = ['anomaly_model'];
  if (ruleHits.length) decisionDrivers.push('rules');
  if (fraudLabel !== undefined) decisionDrivers.push('fraud_label');

  return {
    whyFlagged: [...new Set(whyFlagged)].slice(0, 5),
    whyLegit: [...new Set(whyLegit)].slice(0, 4),
    finalRecommendation,
    recommendedAction,
    confidenceLevel: confidenceLevel as 'high' | 'medium' | 'low',
    uncertaintyNote,
    decisionDrivers,
  };
}

function collectEntityRisk(records: TransactionRecord[], flaggedById: Map<string, FlaggedRecord>, field: FraudCanonicalField) {
  const rollup = new Map<string, { suspiciousCount: number; suspiciousAmount: number }>();
  records.forEach((record) => {
    const value = record.normalized[field];
    if (!value || !flaggedById.get(record.id)?.suspicious) return;
    const key = String(value);
    const current = rollup.get(key) ?? { suspiciousCount: 0, suspiciousAmount: 0 };
    current.suspiciousCount += 1;
    current.suspiciousAmount += asNumber(record.normalized.amount) ?? 0;
    rollup.set(key, current);
  });
  return [...rollup.entries()]
    .map(([value, item]) => ({
      entityType: CANONICAL_DISPLAY[field],
      value,
      suspiciousCount: item.suspiciousCount,
      suspiciousAmount: item.suspiciousAmount || null,
    }))
    .sort((left, right) => (right.suspiciousAmount ?? 0) - (left.suspiciousAmount ?? 0) || right.suspiciousCount - left.suspiciousCount);
}

function buildEntityLinks(records: TransactionRecord[], suspicious: FlaggedRecord[], documents: UploadedDocument[]): EntityLink[] {
  const suspiciousIds = new Set(suspicious.map((item) => item.recordId));
  const entityMap = new Map<string, EntityLink>();
  records.forEach((record) => {
    if (!suspiciousIds.has(record.id)) return;
    (['customer_id', 'merchant_id', 'device_id', 'ip_address', 'location'] as const).forEach((field) => {
      const value = record.normalized[field];
      if (!value) return;
      const key = `${field}:${value}`;
      const current = entityMap.get(key) ?? {
        entityType: field,
        value: String(value),
        suspiciousCount: 0,
        linkedRecordIds: [],
        linkedCaseIds: [],
        explanation: `Suspicious transactions share ${field.replace(/_/g, ' ')} ${value}.`,
      };
      current.suspiciousCount += 1;
      current.linkedRecordIds.push(record.id);
      current.linkedCaseIds = documents.flatMap((document) => document.linkedCaseIds);
      entityMap.set(key, current);
    });
  });
  return [...entityMap.values()].sort((left, right) => right.suspiciousCount - left.suspiciousCount).slice(0, 24);
}

export function runIsolationForestLikeAnalysis(
  dataset: UploadedDataset,
  documents: UploadedDocument[],
  settings: WorkspaceSettings
): { run: AnalysisRun; cases: FraudCase[]; entityLinks: EntityLink[] } {
  const { featureNames, vectors } = buildFeatureMatrix(dataset);
  if (!featureNames.length) throw new Error('No analyzable numeric or timestamp-derived features were found in the dataset.');

  const sampleSize = Math.min(64, Math.max(8, vectors.length));
  const treeCount = Math.max(32, Math.min(96, vectors.length * 4));
  const maxDepth = Math.ceil(Math.log2(sampleSize));
  const peerHistory = buildPeerHistory(dataset.records);

  const forest = Array.from({ length: treeCount }, (_, treeIndex) => {
    const random = pseudoRandom(hashSeed(`${dataset.id}:${treeIndex}`));
    const sample = Array.from({ length: sampleSize }, () => vectors[Math.floor(random() * vectors.length)]).map((item) => item.values);
    return buildIsolationTree(sample, 0, maxDepth, random);
  });

  const scored = vectors.map((vector) => {
    const avgPath = forest.reduce((sum, tree) => sum + pathLength(tree, vector.values), 0) / forest.length;
    const anomalyScore = Math.pow(2, -avgPath / cFactor(sampleSize));
    const fraudLabel = asBooleanLabel(vector.record.normalized.fraud_label);
    const ruleHits = evaluateRules(vector.record, dataset, settings, peerHistory);
    const anomalyRiskScore = Math.round(anomalyScore * 100);
    const combinedRiskScore = Math.min(100, Math.round(anomalyRiskScore * 0.65 + ruleHits.reduce((sum, hit) => sum + hit.scoreImpact, 0) + (fraudLabel ? 12 : 0)));
    const narrative = deriveDecisionNarrative(vector.record, anomalyScore, combinedRiskScore, ruleHits, vector.zSignals, peerHistory, fraudLabel);
    return {
      record: vector.record,
      anomalyScore,
      combinedRiskScore,
      riskScore: anomalyRiskScore,
      reasons: [...narrative.whyFlagged, ...ruleHits.map((item) => item.label)].slice(0, 5),
      features: Object.fromEntries(vector.zSignals.map((item) => [item.key, Number(item.raw.toFixed(4))])),
      fraudLabel,
      ruleHits,
      ...narrative,
    };
  });

  const sortedScores = scored.map((item) => item.combinedRiskScore).sort((left, right) => left - right);
  const threshold = quantile(sortedScores, settings.anomalyThreshold);

  const flaggedRecords: FlaggedRecord[] = scored.map((item) => {
    const suspicious = item.combinedRiskScore >= threshold;
    const riskBand =
      item.combinedRiskScore >= settings.riskBands.critical
        ? 'critical'
        : item.combinedRiskScore >= settings.riskBands.high
        ? 'high'
        : item.combinedRiskScore >= settings.riskBands.medium
        ? 'medium'
        : 'low';
    return {
      recordId: item.record.id,
      anomalyScore: Number(item.anomalyScore.toFixed(4)),
      combinedRiskScore: item.combinedRiskScore,
      riskScore: item.riskScore,
      suspicious,
      riskBand,
      reasons: item.reasons,
      features: item.features,
      ruleHits: item.ruleHits,
      whyFlagged: item.whyFlagged,
      whyLegit: item.whyLegit,
      finalRecommendation: item.finalRecommendation,
      recommendedAction: item.recommendedAction,
      confidenceLevel: item.confidenceLevel,
      uncertaintyNote: item.uncertaintyNote,
      decisionDrivers: item.decisionDrivers,
      fraudLabel: item.fraudLabel,
    };
  });

  const flaggedById = new Map(flaggedRecords.map((record) => [record.recordId, record]));
  const suspicious = flaggedRecords.filter((record) => record.suspicious);
  const totalAmount = dataset.records.reduce((sum, record) => sum + (asNumber(record.normalized.amount) ?? 0), 0);
  const suspiciousAmount = dataset.records.reduce((sum, record) => (flaggedById.get(record.id)?.suspicious ? sum + (asNumber(record.normalized.amount) ?? 0) : sum), 0);
  const labels = flaggedRecords.filter((record) => typeof record.fraudLabel === 'boolean');
  const labeledFraud = labels.filter((record) => record.fraudLabel).length;
  const anomalyFraudOverlap = flaggedRecords.filter((record) => record.suspicious && record.fraudLabel).length;
  const derivedLabelCounts = suspicious.reduce(
    (counts, record) => {
      const label =
        record.combinedRiskScore >= settings.riskBands.high
          ? 'high_risk'
          : record.combinedRiskScore >= settings.derivedMediumRiskThreshold
          ? 'medium_risk'
          : 'low_risk';
      counts[label] += 1;
      return counts;
    },
    { high_risk: 0, medium_risk: 0, low_risk: 0 }
  );
  const labelMode = labels.length ? 'ground_truth' : 'derived_only';

  const metrics: FraudMetrics = {
    totalTransactions: dataset.records.length,
    suspiciousTransactions: suspicious.length,
    anomalyRate: dataset.records.length ? suspicious.length / dataset.records.length : null,
    fraudRate: labels.length ? labeledFraud / dataset.records.length : null,
    derivedHighRiskRate: dataset.records.length ? derivedLabelCounts.high_risk / dataset.records.length : null,
    totalAmount: totalAmount || null,
    highRiskExposure: suspiciousAmount || null,
    suspiciousAmount: suspiciousAmount || null,
    labeledFraudCount: labels.length ? labeledFraud : null,
    anomalyFraudOverlap: labels.length ? anomalyFraudOverlap : null,
    derivedLabelCounts,
    labelMode,
    derivedLabelField: 'derived_risk_label',
    sourceLabelAvailable: labels.length > 0,
    labelExplanation: labels.length
      ? 'Fraud rate is calculated from the mapped source fraud label. Derived risk labels remain analyst-support only.'
      : 'Derived risk labels were generated because no source fraud label column was provided.',
    confirmedFraudCases: 0,
    falsePositiveCases: 0,
    underReviewCases: 0,
  };

  const anomaliesByDayMap = new Map<string, number>();
  dataset.records.forEach((record) => {
    if (!flaggedById.get(record.id)?.suspicious) return;
    const timestamp = toTimestampMillis(record.normalized.timestamp);
    const bucket = timestamp ? new Date(timestamp).toISOString().slice(0, 10) : 'Unknown';
    anomaliesByDayMap.set(bucket, (anomaliesByDayMap.get(bucket) ?? 0) + 1);
  });

  const entities = [
    ...collectEntityRisk(dataset.records, flaggedById, 'merchant_id'),
    ...collectEntityRisk(dataset.records, flaggedById, 'customer_id'),
    ...collectEntityRisk(dataset.records, flaggedById, 'device_id'),
    ...collectEntityRisk(dataset.records, flaggedById, 'location'),
  ];

  const linkedDocumentIds = documents.map((document) => document.id);
  const generatedCases: FraudCase[] = suspicious.map((flagged) => {
    const record = dataset.records.find((item) => item.id === flagged.recordId);
    return {
      id: `case_${flagged.recordId}`,
      title: `Investigate transaction ${record?.normalized.transaction_id ?? flagged.recordId}`,
      createdAt: new Date().toISOString(),
      severity: flagged.riskBand,
      status: 'new',
      recordId: flagged.recordId,
      datasetId: dataset.id,
      anomalyScore: flagged.anomalyScore,
      combinedRiskScore: flagged.combinedRiskScore,
      riskScore: flagged.riskScore,
      reasons: flagged.reasons,
      whyFlagged: flagged.whyFlagged,
      whyLegit: flagged.whyLegit,
      ruleHits: flagged.ruleHits,
      finalRecommendation: flagged.finalRecommendation,
      recommendedAction: flagged.recommendedAction,
      linkedDocumentIds,
      dispositionHistory: [{ at: new Date().toISOString(), actor: 'system', disposition: 'new', note: 'Case generated from hybrid fraud detection run.' }],
    };
  });

  return {
    run: {
      id: `run_${dataset.id}_${Date.now()}`,
      datasetId: dataset.id,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      algorithm: 'isolation_forest',
      threshold,
      contamination: settings.contamination,
      featuresUsed: featureNames,
      flaggedRecords,
      metrics,
      anomaliesByDay: [...anomaliesByDayMap.entries()].map(([bucket, count]) => ({ bucket, count })).sort((left, right) => left.bucket.localeCompare(right.bucket)),
      topRiskEntities: entities.slice(0, 8),
      entityRiskBreakdown: entities.slice(0, 16).map((item) => ({ entityType: item.entityType, value: item.value, suspiciousCount: item.suspiciousCount })),
      reportGenerated: false,
    },
    cases: generatedCases,
    entityLinks: buildEntityLinks(dataset.records, suspicious, documents),
  };
}
