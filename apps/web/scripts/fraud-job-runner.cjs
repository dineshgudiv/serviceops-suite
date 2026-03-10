const fs = require('fs');
const path = require('path');
const readline = require('readline');
const XLSX = require('xlsx');
const { utils, writeFile } = XLSX;

const DATA_ROOT = process.env.FRAUD_OPS_DATA_ROOT || path.join(require('os').tmpdir(), 'fraud-ops-risk-console');

const FIELD_SYNONYMS = {
  transaction_id: ['transaction_id', 'transactionid', 'txn_id', 'txnid', 'event_id', 'payment_id'],
  customer_id: ['customer_id', 'customerid', 'user_id', 'userid', 'account_id', 'member_id'],
  merchant_id: ['merchant_id', 'merchantid', 'store_id', 'seller_id', 'payee_id'],
  amount: ['amount', 'amt', 'transaction_amount', 'value', 'gross_amount'],
  timestamp: ['timestamp', 'event_time', 'created_at', 'time', 'datetime', 'transaction_time'],
  location: ['location', 'city', 'country', 'region', 'geo', 'merchant_location'],
  ip_address: ['ip_address', 'ip', 'ipaddr', 'source_ip'],
  device_id: ['device_id', 'deviceid', 'fingerprint', 'browser_id', 'terminal_id'],
  payment_method: ['payment_method', 'paymentmethod', 'method', 'channel', 'instrument'],
  fraud_label: ['fraud', 'fraud_label', 'is_fraud', 'label', 'chargeback', 'target'],
  status: ['status', 'state', 'txn_status', 'transaction_status'],
};

function orgRoot(orgKey) {
  return path.join(DATA_ROOT, orgKey.replace(/[^a-zA-Z0-9._-]+/g, '_'));
}
function workspacePath(orgKey) { return path.join(orgRoot(orgKey), 'workspace.json'); }
function readWorkspace(orgKey) { return JSON.parse(fs.readFileSync(workspacePath(orgKey), 'utf8')); }
function writeWorkspace(orgKey, workspace) { workspace.updatedAt = new Date().toISOString(); fs.writeFileSync(workspacePath(orgKey), JSON.stringify(workspace, null, 2), 'utf8'); }
function datasetDir(orgKey, datasetId) { return path.join(orgRoot(orgKey), 'datasets', datasetId); }
function datasetArtifacts(orgKey, datasetId) {
  const base = datasetDir(orgKey, datasetId);
  ensureDir(base);
  return {
    base,
    flaggedPath: path.join(base, 'flagged.json'),
    casesPath: path.join(base, 'cases.json'),
    flaggedCsvPath: path.join(base, 'flagged.csv'),
  };
}
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function detectField(header) {
  const normalized = String(header || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  for (const [field, aliases] of Object.entries(FIELD_SYNONYMS)) {
    if (aliases.includes(normalized)) return field;
  }
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function asNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function asBooleanLabel(value) {
  if (value == null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'fraud', 'yes', 'y', 'chargeback', 'positive'].includes(normalized)) return true;
  if (['0', 'false', 'legit', 'legitimate', 'no', 'n', 'negative'].includes(normalized)) return false;
  return undefined;
}

function asTimestampMs(value) {
  if (value == null || value === '') return null;
  const numeric = asNumber(value);
  if (numeric != null) {
    if (numeric >= 1e12) return numeric;
    if (numeric >= 1e10) return numeric;
    return numeric * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function appendAudit(workspace, event) {
  workspace.auditEvents.unshift({ id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), ...event });
}

function deriveRiskLabel(combinedRiskScore, anomalyScore, ruleHits, settings) {
  const strongRuleHits = ruleHits.filter((hit) => hit.severity === 'high').length;
  if (
    combinedRiskScore >= settings.derivedHighRiskThreshold ||
    anomalyScore >= 0.82 ||
    strongRuleHits >= 2 ||
    ruleHits.length >= 3
  ) {
    return 'high_risk';
  }
  if (
    combinedRiskScore >= settings.derivedMediumRiskThreshold ||
    anomalyScore >= 0.4 ||
    ruleHits.length >= 1
  ) {
    return 'medium_risk';
  }
  return 'low_risk';
}

function histogramBucket(score) {
  const start = Math.max(0, Math.floor(score * 10) / 10);
  const end = Math.min(1, start + 0.1);
  return `${start.toFixed(1)}-${end.toFixed(1)}`;
}

function amountBucket(value) {
  if (value == null) return 'unknown';
  if (value < 100) return '0-99';
  if (value < 500) return '100-499';
  if (value < 1000) return '500-999';
  if (value < 5000) return '1000-4999';
  return '5000+';
}

function correlationValue(stat) {
  if (!stat || stat.count < 2) return 0;
  const numerator = stat.count * stat.sumXY - stat.sumX * stat.sumY;
  const denominator = Math.sqrt(
    Math.max(0, stat.count * stat.sumXX - stat.sumX * stat.sumX) *
      Math.max(0, stat.count * stat.sumYY - stat.sumY * stat.sumY)
  );
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(3));
}

function isJobCancelled(orgKey, jobId) {
  try {
    const workspace = readWorkspace(orgKey);
    return workspace.jobs.find((item) => item.id === jobId)?.status === 'cancelled';
  } catch {
    return false;
  }
}

async function parseDataset(orgKey, jobId, datasetId) {
  const workspace = readWorkspace(orgKey);
  const dataset = workspace.datasets.find((item) => item.id === datasetId);
  const job = workspace.jobs.find((item) => item.id === jobId);
  if (!dataset || !job) return;
  job.status = 'parsing';
  job.progressPct = 5;
  writeWorkspace(orgKey, workspace);

  const sourcePath = path.join(datasetDir(orgKey, datasetId), 'source' + path.extname(dataset.name).toLowerCase());
  ensureDir(datasetDir(orgKey, datasetId));
  const stats = fs.statSync(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();

  if (ext !== '.csv') {
    if (stats.size > 50 * 1024 * 1024) {
      job.status = 'failed';
      job.failureReason = 'Large Excel workbooks are not processed in streaming mode. Convert the file to CSV for 800MB+ ingestion.';
      dataset.status = 'failed';
      dataset.analysisReadiness = 'waiting_for_mapping';
      dataset.quality.unsupportedSchemaWarnings = ['Large Excel workbook detected. Convert to CSV for large-scale ingestion.'];
      appendAudit(workspace, { actor: 'system', action: 'dataset_parse_failed', resource: dataset.name, details: { dataset_id: dataset.id, reason: job.failureReason } });
      writeWorkspace(orgKey, workspace);
      return;
    }
    const workbook = XLSX.readFile(sourcePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    dataset.availableSheets = workbook.SheetNames;
    dataset.selectedSheet = sheetName;
    dataset.rowCount = rows.length;
    dataset.columnCount = headers.length;
    dataset.schema = headers.map((header) => ({
      name: header,
      mappedTo: detectField(header),
      dataType: 'mixed',
      sampleValues: rows.slice(0, 4).map((row) => String(row[header] ?? '')),
      nonEmptyCount: rows.filter((row) => row[header] != null && row[header] !== '').length,
    }));
    dataset.mappingCompleteness = dataset.schema.length ? dataset.schema.filter((field) => field.mappedTo).length / dataset.schema.length : 0;
    dataset.labelColumn = dataset.schema.find((field) => field.mappedTo === 'fraud_label')?.name;
    dataset.labelColumnMapped = Boolean(dataset.labelColumn);
    dataset.labelMode = dataset.labelColumn ? 'ground_truth' : 'derived_only';
    dataset.derivedLabelField = 'derived_risk_label';
    dataset.derivedLabelGenerated = false;
    dataset.selectedFeatures = dataset.schema.filter((field) => ['numeric', 'mixed'].includes(field.dataType) && field.mappedTo !== 'fraud_label').map((field) => field.name);
    dataset.usableFeatureCount = dataset.selectedFeatures.length + dataset.schema.filter((field) => field.dataType === 'datetime').length;
    const amountHeader = dataset.schema.find((field) => field.mappedTo === 'amount')?.name;
    const timestampHeader = dataset.schema.find((field) => field.mappedTo === 'timestamp')?.name;
    const customerHeader = dataset.schema.find((field) => field.mappedTo === 'customer_id')?.name;
    const merchantHeader = dataset.schema.find((field) => field.mappedTo === 'merchant_id')?.name;
    const amountValues = amountHeader ? rows.map((row) => asNumber(row[amountHeader])).filter((value) => value != null) : [];
    const timeValues = timestampHeader ? rows.map((row) => asTimestampMs(row[timestampHeader])).filter((value) => value != null) : [];
    dataset.statistics = {
      timeSpanStart: timeValues.length ? new Date(Math.min(...timeValues)).toISOString() : undefined,
      timeSpanEnd: timeValues.length ? new Date(Math.max(...timeValues)).toISOString() : undefined,
      uniqueCustomers: customerHeader ? new Set(rows.map((row) => String(row[customerHeader] || '')).filter(Boolean)).size : undefined,
      uniqueMerchants: merchantHeader ? new Set(rows.map((row) => String(row[merchantHeader] || '')).filter(Boolean)).size : undefined,
      averageAmount: amountValues.length ? amountValues.reduce((sum, value) => sum + value, 0) / amountValues.length : null,
      maxAmount: amountValues.length ? Math.max(...amountValues) : null,
    };
    const amountDistribution = new Map();
    amountValues.forEach((value) => amountDistribution.set(amountBucket(value), (amountDistribution.get(amountBucket(value)) || 0) + 1));
    const transactionTimeDistribution = new Map();
    timeValues.forEach((value) => {
      const bucket = new Date(value).getUTCHours().toString().padStart(2, '0');
      transactionTimeDistribution.set(bucket, (transactionTimeDistribution.get(bucket) || 0) + 1);
    });
    dataset.chartSummary = {
      amountDistribution: [...amountDistribution.entries()].map(([bucket, count]) => ({ bucket, count })),
      transactionTimeDistribution: [...transactionTimeDistribution.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, count]) => ({ bucket, count })),
      featureCorrelation: [],
    };
    dataset.status = 'ready';
    dataset.analysisReadiness = dataset.usableFeatureCount ? 'ready_for_analysis' : 'analysis_blocked';
    job.status = 'ready_for_analysis';
    job.progressPct = 100;
    job.finishedAt = new Date().toISOString();
    writeWorkspace(orgKey, workspace);
    return;
  }

  const stream = fs.createReadStream(sourcePath, 'utf8');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = [];
  let lineNo = 0;
  const samples = new Map();
  const nonEmptyCount = new Map();
  const numericCount = new Map();
  const timestampCount = new Map();
  const nullCount = new Map();
  const distinct = new Map();
  let amountSum = 0;
  let amountCount = 0;
  let amountMax = null;
  let minTimestamp = null;
  let maxTimestamp = null;
  const amountDistribution = new Map();
  const transactionTimeDistribution = new Map();
  let duplicateRows = 0;
  const seen = new Set();
  for await (const line of rl) {
    if (!line.trim()) continue;
    lineNo += 1;
    const cells = parseCsvLine(line);
    if (lineNo === 1) {
      headers = cells.map((cell) => String(cell).trim());
      headers.forEach((header) => {
        samples.set(header, []);
        nonEmptyCount.set(header, 0);
        numericCount.set(header, 0);
        timestampCount.set(header, 0);
        nullCount.set(header, 0);
        distinct.set(header, new Set());
      });
      continue;
    }
    const key = cells.join('|');
    if (seen.has(key)) duplicateRows += 1;
    else seen.add(key);
    headers.forEach((header, index) => {
      const value = (cells[index] || '').trim();
      if (!value) {
        nullCount.set(header, (nullCount.get(header) || 0) + 1);
        return;
      }
      nonEmptyCount.set(header, (nonEmptyCount.get(header) || 0) + 1);
      if ((samples.get(header) || []).length < 4) samples.get(header).push(value);
      const numeric = asNumber(value);
      if (numeric != null) {
        numericCount.set(header, (numericCount.get(header) || 0) + 1);
        if (detectField(header) === 'amount') {
          amountSum += numeric;
          amountCount += 1;
          amountMax = amountMax == null ? numeric : Math.max(amountMax, numeric);
          const bucket = amountBucket(numeric);
          amountDistribution.set(bucket, (amountDistribution.get(bucket) || 0) + 1);
        }
      }
      const parsedTime = asTimestampMs(value);
      if (parsedTime != null) {
        timestampCount.set(header, (timestampCount.get(header) || 0) + 1);
        if (detectField(header) === 'timestamp') {
          minTimestamp = minTimestamp == null ? parsedTime : Math.min(minTimestamp, parsedTime);
          maxTimestamp = maxTimestamp == null ? parsedTime : Math.max(maxTimestamp, parsedTime);
          const bucket = new Date(parsedTime).getUTCHours().toString().padStart(2, '0');
          transactionTimeDistribution.set(bucket, (transactionTimeDistribution.get(bucket) || 0) + 1);
        }
      }
      if ((distinct.get(header) || new Set()).size < 2000) distinct.get(header).add(value);
    });
    if (lineNo % 25000 === 0) {
      if (isJobCancelled(orgKey, jobId)) return;
      job.progressPct = Math.min(85, Math.round((stream.bytesRead / stats.size) * 100));
      writeWorkspace(orgKey, workspace);
    }
  }

  dataset.rowCount = Math.max(0, lineNo - 1);
  dataset.columnCount = headers.length;
  dataset.availableSheets = ['Sheet1'];
  dataset.selectedSheet = 'Sheet1';
  dataset.schema = headers.map((header) => {
    const count = Math.max(1, dataset.rowCount);
    const numeric = numericCount.get(header) || 0;
    const timestamps = timestampCount.get(header) || 0;
    let dataType = 'text';
    if (numeric === count) dataType = 'numeric';
    else if (timestamps > count * 0.6) dataType = 'datetime';
    else if (numeric > 0 || timestamps > 0) dataType = 'mixed';
    return {
      name: header,
      mappedTo: detectField(header),
      dataType,
      sampleValues: samples.get(header) || [],
      nonEmptyCount: nonEmptyCount.get(header) || 0,
    };
  });
  dataset.mappingCompleteness = dataset.schema.length ? dataset.schema.filter((field) => field.mappedTo).length / dataset.schema.length : 0;
  dataset.labelColumn = dataset.schema.find((field) => field.mappedTo === 'fraud_label')?.name;
  dataset.labelColumnMapped = Boolean(dataset.labelColumn);
  dataset.labelMode = dataset.labelColumn ? 'ground_truth' : 'derived_only';
  dataset.derivedLabelField = 'derived_risk_label';
  dataset.derivedLabelGenerated = false;
  dataset.selectedFeatures = dataset.schema.filter((field) => ['numeric', 'mixed'].includes(field.dataType) && field.mappedTo !== 'fraud_label').map((field) => field.name);
  dataset.usableFeatureCount = dataset.selectedFeatures.length + dataset.schema.filter((field) => field.dataType === 'datetime').length;
  dataset.quality = {
    duplicateRows,
    invalidTimestamps: 0,
    nullHeavyColumns: dataset.schema
      .map((field) => ({ column: field.name, nullRate: ((nullCount.get(field.name) || 0) / Math.max(1, dataset.rowCount)) }))
      .filter((item) => item.nullRate >= 0.4)
      .sort((a, b) => b.nullRate - a.nullRate)
      .slice(0, 6),
    invalidAmountRows: 0,
    negativeAmountRows: 0,
    unsupportedSchemaWarnings: [],
    insufficientFeatureWarning: dataset.usableFeatureCount ? undefined : 'No analyzable numeric or timestamp-derived features were found in the dataset.',
    highCardinalityColumns: headers.map((header) => ({ column: header, distinctEstimate: (distinct.get(header) || new Set()).size })).filter((item) => item.distinctEstimate > 500).slice(0, 6),
    lowCardinalityColumns: headers.map((header) => ({ column: header, distinctEstimate: (distinct.get(header) || new Set()).size })).filter((item) => item.distinctEstimate > 0 && item.distinctEstimate <= 5).slice(0, 6),
  };
  const numericHeaders = dataset.schema.filter((field) => ['numeric', 'mixed'].includes(field.dataType)).map((field) => field.name).slice(0, 5);
  const correlations = [];
  if (numericHeaders.length >= 2) {
    const correlationStats = new Map();
    for (let left = 0; left < numericHeaders.length; left += 1) {
      for (let right = left + 1; right < numericHeaders.length; right += 1) {
        correlationStats.set(`${numericHeaders[left]}||${numericHeaders[right]}`, { count: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0 });
      }
    }
    const streamCorr = fs.createReadStream(sourcePath, 'utf8');
    const rlCorr = readline.createInterface({ input: streamCorr, crlfDelay: Infinity });
    let corrLineNo = 0;
    for await (const line of rlCorr) {
      if (!line.trim()) continue;
      corrLineNo += 1;
      if (corrLineNo === 1) continue;
      const cells = parseCsvLine(line);
      const rowValues = new Map();
      headers.forEach((header, index) => rowValues.set(header, asNumber((cells[index] || '').trim())));
      for (let left = 0; left < numericHeaders.length; left += 1) {
        for (let right = left + 1; right < numericHeaders.length; right += 1) {
          const x = rowValues.get(numericHeaders[left]);
          const y = rowValues.get(numericHeaders[right]);
          if (x == null || y == null) continue;
          const current = correlationStats.get(`${numericHeaders[left]}||${numericHeaders[right]}`);
          current.count += 1;
          current.sumX += x;
          current.sumY += y;
          current.sumXX += x * x;
          current.sumYY += y * y;
          current.sumXY += x * y;
        }
      }
    }
    for (const [key, stat] of correlationStats.entries()) {
      const [featureX, featureY] = key.split('||');
      correlations.push({ featureX, featureY, correlation: correlationValue(stat) });
    }
  }
  dataset.statistics = {
    timeSpanStart: minTimestamp == null ? undefined : new Date(minTimestamp).toISOString(),
    timeSpanEnd: maxTimestamp == null ? undefined : new Date(maxTimestamp).toISOString(),
    uniqueCustomers: dataset.schema.find((field) => field.mappedTo === 'customer_id') ? (distinct.get(dataset.schema.find((field) => field.mappedTo === 'customer_id').name) || new Set()).size : undefined,
    uniqueMerchants: dataset.schema.find((field) => field.mappedTo === 'merchant_id') ? (distinct.get(dataset.schema.find((field) => field.mappedTo === 'merchant_id').name) || new Set()).size : undefined,
    averageAmount: amountCount ? amountSum / amountCount : null,
    maxAmount: amountMax,
  };
  dataset.chartSummary = {
    amountDistribution: [...amountDistribution.entries()].map(([bucket, count]) => ({ bucket, count })),
    transactionTimeDistribution: [...transactionTimeDistribution.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, count]) => ({ bucket, count })),
    featureCorrelation: correlations.slice(0, 12),
  };
  dataset.status = 'ready';
  dataset.analysisReadiness = dataset.usableFeatureCount ? 'ready_for_analysis' : 'analysis_blocked';
  job.status = dataset.mappingCompleteness < 0.35 ? 'waiting_for_mapping' : dataset.usableFeatureCount ? 'ready_for_analysis' : 'failed';
  job.progressPct = 100;
  job.finishedAt = new Date().toISOString();
  job.failureReason = dataset.usableFeatureCount ? undefined : dataset.quality.insufficientFeatureWarning;
  appendAudit(workspace, { actor: 'system', action: 'dataset_parsed', resource: dataset.name, details: { dataset_id: dataset.id, rows: dataset.rowCount, columns: dataset.columnCount } });
  writeWorkspace(orgKey, workspace);
}

async function analyzeDataset(orgKey, jobId, datasetId) {
  const workspace = readWorkspace(orgKey);
  const dataset = workspace.datasets.find((item) => item.id === datasetId);
  const job = workspace.jobs.find((item) => item.id === jobId);
  if (!dataset || !job) return;
  const sourcePath = path.join(datasetDir(orgKey, datasetId), 'source' + path.extname(dataset.name).toLowerCase());
  job.status = 'analyzing';
  job.progressPct = 10;
  writeWorkspace(orgKey, workspace);

  if (path.extname(sourcePath).toLowerCase() !== '.csv') {
    job.status = 'failed';
    job.failureReason = 'Large-scale analysis is implemented for CSV ingestion. Convert Excel uploads to CSV before analysis.';
    writeWorkspace(orgKey, workspace);
    return;
  }
  if (!dataset.usableFeatureCount) {
    job.status = 'failed';
    job.failureReason = dataset.quality.insufficientFeatureWarning || 'Insufficient features for analysis.';
    writeWorkspace(orgKey, workspace);
    return;
  }

  const headers = dataset.schema.map((field) => field.name);
  const mapping = new Map(dataset.schema.map((field) => [field.name, field.mappedTo]));
  const selectedFeatureHeaders = (dataset.selectedFeatures && dataset.selectedFeatures.length
    ? dataset.selectedFeatures
    : dataset.schema.filter((field) => ['numeric', 'mixed'].includes(field.dataType) && field.mappedTo !== 'fraud_label').map((field) => field.name)
  ).slice(0, 8);
  const amountHeader = headers.find((header) => mapping.get(header) === 'amount');
  const timestampHeader = headers.find((header) => mapping.get(header) === 'timestamp');
  const stats = new Map();
  const stream1 = fs.createReadStream(sourcePath, 'utf8');
  const rl1 = readline.createInterface({ input: stream1, crlfDelay: Infinity });
  let lineNo = 0;
  let totalRows = 0;
  for await (const line of rl1) {
    if (!line.trim()) continue;
    lineNo += 1;
    if (lineNo === 1) continue;
    totalRows += 1;
    const cells = parseCsvLine(line);
    headers.forEach((header, index) => {
      const mapped = mapping.get(header);
      const value = cells[index];
      if (selectedFeatureHeaders.includes(header) || mapped === 'amount') {
        const numeric = asNumber(value);
        if (numeric != null) {
          const key = header;
          const current = stats.get(key) || { count: 0, mean: 0, m2: 0 };
          current.count += 1;
          const delta = numeric - current.mean;
          current.mean += delta / current.count;
          current.m2 += delta * (numeric - current.mean);
          stats.set(key, current);
        }
      }
    });
  }
  const amountStats = amountHeader ? (stats.get(amountHeader) || { count: 0, mean: 0, m2: 0 }) : { count: 0, mean: 0, m2: 0 };
  const amountStd = amountStats.count > 1 ? Math.sqrt(amountStats.m2 / amountStats.count) : 1;
  const flagged = [];
  const cases = [];
  const topRiskEntities = new Map();
  const anomaliesByDay = new Map();
  const reasonBreakdown = new Map();
  const anomalyScoreDistribution = new Map();
  const riskBandDistribution = new Map([
    ['critical', { band: 'critical', count: 0, amount: 0 }],
    ['high', { band: 'high', count: 0, amount: 0 }],
    ['medium', { band: 'medium', count: 0, amount: 0 }],
    ['low', { band: 'low', count: 0, amount: 0 }],
  ]);
  const ruleHitDistribution = new Map();
  let suspiciousTransactions = 0;
  let totalAmount = 0;
  let highRiskExposure = 0;
  let labeledFraudCount = 0;
  let anomalyFraudOverlap = 0;
  let derivedHighRiskCount = 0;
  const derivedLabelCounts = { high_risk: 0, medium_risk: 0, low_risk: 0 };
  const sourceLabelAvailable = Boolean(dataset.labelColumn);
  const labelMode = sourceLabelAvailable ? 'ground_truth' : 'derived_only';
  const artifacts = datasetArtifacts(orgKey, datasetId);
  const flaggedCsvPath = artifacts.flaggedCsvPath;
  const flaggedCsv = fs.createWriteStream(flaggedCsvPath);
  flaggedCsv.write('transaction_id,customer_id,merchant_id,amount,timestamp,risk_score,anomaly_score,derived_risk_label,fraud_label,recommendation\n');
  const stream2 = fs.createReadStream(sourcePath, 'utf8');
  const rl2 = readline.createInterface({ input: stream2, crlfDelay: Infinity });
  lineNo = 0;
  for await (const line of rl2) {
    if (!line.trim()) continue;
    lineNo += 1;
    if (lineNo === 1) continue;
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = (cells[index] || '').trim(); });
    const transactionId = row[headers.find((header) => mapping.get(header) === 'transaction_id')] || `row_${lineNo - 1}`;
    const customerId = row[headers.find((header) => mapping.get(header) === 'customer_id')] || '';
    const merchantId = row[headers.find((header) => mapping.get(header) === 'merchant_id')] || '';
    const location = row[headers.find((header) => mapping.get(header) === 'location')] || '';
    const deviceId = row[headers.find((header) => mapping.get(header) === 'device_id')] || '';
    const timestamp = row[timestampHeader] || '';
    const timestampMs = asTimestampMs(timestamp);
    const fraudLabelValue = row[headers.find((header) => mapping.get(header) === 'fraud_label')] || '';
    const amount = amountHeader ? asNumber(row[amountHeader]) : null;
    if (amount != null) totalAmount += amount;
    const fraudLabel = asBooleanLabel(fraudLabelValue);
    if (fraudLabel) labeledFraudCount += 1;
    const amountZ = amount != null ? Math.abs((amount - amountStats.mean) / (amountStd || 1)) : 0;
    const featureSignal = selectedFeatureHeaders.length
      ? selectedFeatureHeaders.reduce((sum, header) => {
          const numeric = asNumber(row[header]);
          const featureStats = stats.get(header);
          if (numeric == null || !featureStats) return sum;
          const featureStd = featureStats.count > 1 ? Math.sqrt(featureStats.m2 / featureStats.count) : 1;
          return sum + Math.abs((numeric - featureStats.mean) / (featureStd || 1));
        }, 0) / selectedFeatureHeaders.length
      : amountZ;
    const hour = timestampMs == null ? null : new Date(timestampMs).getUTCHours();
    const unusualHour = hour != null && (hour <= 5 || hour >= 23);
    const ruleHits = [];
    if (workspace.settings.enabledRules.includes('high_amount') && amount != null && amount >= workspace.settings.highAmountThreshold) {
      ruleHits.push({ ruleId: 'high_amount', label: 'High amount threshold', severity: 'high', scoreImpact: 18, explanation: 'Transaction amount exceeded the configured threshold.' });
    }
    if (workspace.settings.enabledRules.includes('unusual_hour') && unusualHour) {
      ruleHits.push({ ruleId: 'unusual_hour', label: 'Unusual transaction hour', severity: 'medium', scoreImpact: 10, explanation: 'Transaction occurred in the unusual-hour watch window.' });
    }
    if (workspace.settings.enabledRules.includes('new_device_high_amount') && deviceId && location && amount != null && amount >= 1500) {
      ruleHits.push({ ruleId: 'new_device_high_amount', label: 'New device with high amount', severity: 'high', scoreImpact: 14, explanation: 'Sparse device/location context was observed with elevated amount.' });
    }
    if (workspace.settings.enabledRules.includes('new_location_high_amount') && location && amount != null && amount >= 1500) {
      ruleHits.push({ ruleId: 'new_location_high_amount', label: 'New location with high amount', severity: 'medium', scoreImpact: 12, explanation: 'Elevated amount appeared in a sparse location context.' });
    }
    const anomalyScore = Math.min(1, Math.max(amountZ, featureSignal) / 4);
    const combinedRiskScore = Math.min(100, Math.round(anomalyScore * 65 + ruleHits.reduce((sum, hit) => sum + hit.scoreImpact, 0)));
    const derivedBand = combinedRiskScore >= workspace.settings.riskBands.critical ? 'critical' : combinedRiskScore >= workspace.settings.riskBands.high ? 'high' : combinedRiskScore >= workspace.settings.riskBands.medium ? 'medium' : 'low';
    const dynamicRiskThreshold = Math.max(
      workspace.settings.derivedMediumRiskThreshold,
      Math.round(workspace.settings.riskBands.high - workspace.settings.contamination * 20)
    );
    const suspicious = anomalyScore >= workspace.settings.anomalyThreshold || combinedRiskScore >= dynamicRiskThreshold || derivedBand === 'critical';
    const derivedRiskLabel = deriveRiskLabel(combinedRiskScore, anomalyScore, ruleHits, workspace.settings);
    const anomalyBucket = histogramBucket(anomalyScore);
    anomalyScoreDistribution.set(anomalyBucket, (anomalyScoreDistribution.get(anomalyBucket) || 0) + 1);
    derivedLabelCounts[derivedRiskLabel] += 1;
    if (derivedRiskLabel === 'high_risk') derivedHighRiskCount += 1;
    const bandBucket = riskBandDistribution.get(derivedBand);
    bandBucket.count += 1;
    bandBucket.amount += amount || 0;
    for (const hit of ruleHits) {
      const current = ruleHitDistribution.get(hit.ruleId) || { ruleId: hit.ruleId, label: hit.label, count: 0 };
      current.count += 1;
      ruleHitDistribution.set(hit.ruleId, current);
    }
    if (suspicious) {
      suspiciousTransactions += 1;
      if (amount != null) highRiskExposure += amount;
      if (fraudLabel) anomalyFraudOverlap += 1;
      const whyFlagged = [];
      if (amountZ >= 2) whyFlagged.push('Transaction amount is significantly higher than the customer’s normal pattern.');
      if (unusualHour) whyFlagged.push('Transaction occurred at an unusual hour compared with historical activity.');
      if (deviceId && location) whyFlagged.push('A new device and unfamiliar location were used together.');
      whyFlagged.push(`${ruleHits.length} additional fraud rules were triggered.`);
      const whyLegit = [
        'No confirmed fraud label is available for this transaction.',
        'Only one behavioral pattern is strongly abnormal; others are moderate.',
        'There is currently no additional source confirmation proving malicious intent.',
      ];
      const finalRecommendation = combinedRiskScore >= 85 ? 'High Risk - Immediate Review' : 'Medium-High Risk - Analyst Review Recommended';
      const recommendedAction = 'Review recent customer history and verify device/location consistency before marking as confirmed fraud.';
      flagged.push({
        id: transactionId,
        recordId: transactionId,
        transactionId,
        customerId,
        merchantId,
        deviceId,
        location,
        amount,
        timestamp,
        anomalyScore: Number(anomalyScore.toFixed(4)),
        combinedRiskScore,
        riskBand: derivedBand,
        suspicious: true,
        whyFlagged,
        whyLegit,
        finalRecommendation,
        recommendedAction,
        ruleHits,
        confidenceLevel: combinedRiskScore >= 85 ? 'high' : 'medium',
        uncertaintyNote: 'Hybrid anomaly and rule evaluation should be reviewed with analyst judgment.',
        fraudLabel,
        derivedRiskLabel,
        labelSource: labelMode,
        investigationStatus: 'new',
        evidenceLinks: [],
      });
      reasonBreakdown.set(whyFlagged[0] || 'Hybrid anomaly score exceeded threshold', (reasonBreakdown.get(whyFlagged[0] || 'Hybrid anomaly score exceeded threshold') || 0) + 1);
      for (const [entityType, entityValue] of [['Merchant', merchantId], ['Customer', customerId], ['Device', deviceId], ['Location', location]]) {
        if (!entityValue) continue;
        const key = `${entityType}:${entityValue}`;
        topRiskEntities.set(key, (topRiskEntities.get(key) || { entityType, value: entityValue, suspiciousCount: 0, suspiciousAmount: 0 }));
        const current = topRiskEntities.get(key);
        current.suspiciousCount += 1;
        current.suspiciousAmount += amount || 0;
      }
      if (timestampMs != null) {
        const bucket = new Date(timestampMs).toISOString().slice(0, 10);
        anomaliesByDay.set(bucket, (anomaliesByDay.get(bucket) || 0) + 1);
      }
      flaggedCsv.write(`${transactionId},${customerId},${merchantId},${amount || ''},${timestamp},${combinedRiskScore},${Number(anomalyScore.toFixed(4))},${derivedRiskLabel},${fraudLabel == null ? '' : fraudLabel},"${finalRecommendation.replace(/"/g, '""')}"\n`);
    }
    if (lineNo % 25000 === 0) {
      if (isJobCancelled(orgKey, jobId)) {
        flaggedCsv.end();
        return;
      }
      job.progressPct = Math.min(92, 10 + Math.round((stream2.bytesRead / fs.statSync(sourcePath).size) * 80));
      writeWorkspace(orgKey, workspace);
    }
  }
  flaggedCsv.end();
  flagged.sort((a, b) => b.combinedRiskScore - a.combinedRiskScore);
  const topFlagged = flagged.slice(0, 500);
  const casesTop = topFlagged.slice(0, 500).map((row) => ({
    id: `case_${row.transactionId}`,
    datasetId,
    title: `Investigate transaction ${row.transactionId}`,
    createdAt: new Date().toISOString(),
    severity: row.riskBand,
    status: 'new',
    recordId: row.transactionId,
    transactionId: row.transactionId,
    customerId: row.customerId,
    merchantId: row.merchantId,
    deviceId: row.deviceId,
    location: row.location,
    amount: row.amount,
    combinedRiskScore: row.combinedRiskScore,
    anomalyScore: row.anomalyScore,
    whyFlagged: row.whyFlagged,
    whyLegit: row.whyLegit,
    finalRecommendation: row.finalRecommendation,
    recommendedAction: row.recommendedAction,
    ruleHits: row.ruleHits,
    linkedDocumentIds: [],
    caseLabelSource: labelMode,
    derivedRiskLabel: row.derivedRiskLabel,
    dispositionHistory: [{ at: new Date().toISOString(), actor: 'system', disposition: 'new', note: 'Case generated from scalable background analysis.' }],
  }));
  const runId = `run_${datasetId}_${Date.now()}`;
  workspace.runs = [{
    id: runId,
    datasetId,
    startedAt: job.startedAt,
    completedAt: new Date().toISOString(),
    status: 'completed',
    algorithm: 'streaming_hybrid_anomaly',
    threshold: workspace.settings.anomalyThreshold,
    contamination: workspace.settings.contamination,
    featuresUsed: [...selectedFeatureHeaders, ...(timestampHeader ? [timestampHeader] : [])],
    metrics: {
      totalTransactions: totalRows,
      suspiciousTransactions,
      anomalyRate: totalRows ? suspiciousTransactions / totalRows : null,
      fraudRate: sourceLabelAvailable && totalRows ? labeledFraudCount / totalRows : null,
      derivedHighRiskRate: totalRows ? derivedHighRiskCount / totalRows : null,
      totalAmount: totalAmount || null,
      highRiskExposure: highRiskExposure || null,
      suspiciousAmount: highRiskExposure || null,
      labeledFraudCount: sourceLabelAvailable ? labeledFraudCount : null,
      anomalyFraudOverlap: sourceLabelAvailable ? anomalyFraudOverlap : null,
      derivedLabelCounts,
      labelMode,
      derivedLabelField: 'derived_risk_label',
      sourceLabelAvailable,
      labelExplanation: sourceLabelAvailable
        ? `Ground-truth fraud rate is calculated from the mapped source label column ${dataset.labelColumn}. Derived risk labels remain analyst-support only.`
        : 'Derived risk labels were generated because no source fraud label column was provided. They are based on anomaly score, rule hits, and combined risk bands.',
      confirmedFraudCases: 0,
      falsePositiveCases: 0,
      underReviewCases: 0,
    },
    anomaliesByDay: [...anomaliesByDay.entries()].map(([bucket, count]) => ({ bucket, count })),
    anomalyScoreDistribution: [...anomalyScoreDistribution.entries()]
      .sort((left, right) => Number(left[0].slice(0, 3)) - Number(right[0].slice(0, 3)))
      .map(([bucket, count]) => ({ bucket, count })),
    riskBandDistribution: ['critical', 'high', 'medium', 'low'].map((band) => ({
      band,
      count: riskBandDistribution.get(band).count,
      amount: riskBandDistribution.get(band).amount || null,
    })),
    topRiskEntities: [...topRiskEntities.values()].sort((a, b) => b.suspiciousAmount - a.suspiciousAmount).slice(0, 12),
    decisionSummary: [
      { label: 'High risk', count: derivedLabelCounts.high_risk },
      { label: 'Medium risk', count: derivedLabelCounts.medium_risk },
      { label: 'Low risk', count: derivedLabelCounts.low_risk },
    ],
    reportGenerated: false,
    reasonBreakdown: [...reasonBreakdown.entries()].map(([reason, count]) => ({ reason, count })).slice(0, 8),
    ruleHitDistribution: [...ruleHitDistribution.values()].sort((a, b) => b.count - a.count).slice(0, 8),
  }, ...workspace.runs.filter((item) => item.datasetId !== datasetId)];
  workspace.cases = [...casesTop, ...workspace.cases.filter((item) => item.datasetId !== datasetId)];
  fs.writeFileSync(artifacts.flaggedPath, JSON.stringify(topFlagged, null, 2), 'utf8');
  fs.writeFileSync(artifacts.casesPath, JSON.stringify(casesTop, null, 2), 'utf8');
  dataset.latestRunId = runId;
  dataset.analysisReadiness = 'analysis_ready';
  dataset.derivedLabelGenerated = true;
  job.status = 'report_generating';
  job.progressPct = 95;
  writeWorkspace(orgKey, workspace);
  await generateReport(orgKey, datasetId, runId, topFlagged, flaggedCsvPath);
  const nextWorkspace = readWorkspace(orgKey);
  const nextJob = nextWorkspace.jobs.find((item) => item.id === jobId);
  if (nextJob) {
    nextJob.status = 'completed';
    nextJob.progressPct = 100;
    nextJob.finishedAt = new Date().toISOString();
  }
  appendAudit(nextWorkspace, { actor: 'system', action: 'analysis_completed', resource: dataset.name, details: { dataset_id: datasetId, suspicious_transactions: suspiciousTransactions } });
  writeWorkspace(orgKey, nextWorkspace);
}

async function generateReport(orgKey, datasetId, runId, topFlaggedRows, flaggedCsvPath) {
  const workspace = readWorkspace(orgKey);
  const dataset = workspace.datasets.find((item) => item.id === datasetId);
  const run = workspace.runs.find((item) => item.id === runId);
  if (!dataset || !run) return;
  const reportId = `report_${datasetId}_${Date.now()}`;
  const base = path.join(orgRoot(orgKey), 'reports', reportId);
  ensureDir(base);
  const workbookPath = path.join(base, `fraud_report_${dataset.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}.xlsx`);
  const summary = [
    ['Product', 'Fraud Ops Risk Console'],
    ['Executive Summary', 'Fraud Ops Risk Console is an end-to-end fraud investigation and anomaly analytics platform designed to help analysts detect, explain, investigate, and manage suspicious transactions from a single unified system.'],
    ['Dataset', dataset.name],
    ['Label mode', run.metrics.labelMode],
    ['Source fraud label available', run.metrics.sourceLabelAvailable ? 'Yes' : 'No'],
    ['Derived label field', run.metrics.derivedLabelField || 'Not generated'],
    ['File size bytes', dataset.fileSizeBytes],
    ['Rows parsed', dataset.rowCount],
    ['Columns parsed', dataset.columnCount],
    ['Anomaly rate', run.metrics.anomalyRate ?? 'Not available'],
    ['Fraud rate', run.metrics.fraudRate ?? 'Not available'],
    ['Derived high-risk rate', run.metrics.derivedHighRiskRate ?? 'Not available'],
    ['Label explanation', run.metrics.labelExplanation],
    ['High-risk exposure', run.metrics.highRiskExposure ?? 'Not available'],
    ['What Makes It Different', 'Unlike many basic fraud dashboards that only display predictions, Fraud Ops Risk Console combines data ingestion, anomaly detection, rule-based risk reasoning, investigator-friendly explanations, case workflow, auditability, and report generation in a single platform.'],
    ['Credits', 'Developed by Lead Gudivada Dinesh | Team Member: Kola Tharun'],
  ];
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet(summary), 'Summary');
  utils.book_append_sheet(wb, utils.json_to_sheet(topFlaggedRows.slice(0, 200)), 'Flagged Sample');
  utils.book_append_sheet(wb, utils.json_to_sheet([
    { label: 'high_risk', count: run.metrics.derivedLabelCounts.high_risk },
    { label: 'medium_risk', count: run.metrics.derivedLabelCounts.medium_risk },
    { label: 'low_risk', count: run.metrics.derivedLabelCounts.low_risk },
  ]), 'Derived Labels');
  utils.book_append_sheet(wb, utils.json_to_sheet(run.topRiskEntities), 'Top Entities');
  utils.book_append_sheet(wb, utils.json_to_sheet(workspace.cases.filter((item) => item.datasetId === datasetId).slice(0, 200)), 'Cases');
  writeFile(wb, workbookPath);
  workspace.reports = [{
    id: reportId,
    datasetId,
    generatedAt: new Date().toISOString(),
    filename: path.basename(workbookPath),
    format: 'xlsx',
    sampleFlaggedRows: Math.min(200, topFlaggedRows.length),
    fullFlaggedExportPath: flaggedCsvPath,
  }, ...workspace.reports.filter((item) => item.datasetId !== datasetId)];
  const runRecord = workspace.runs.find((item) => item.id === runId);
  if (runRecord) runRecord.reportGenerated = true;
  appendAudit(workspace, { actor: 'system', action: 'report_generated', resource: path.basename(workbookPath), details: { dataset_id: datasetId, report_id: reportId } });
  writeWorkspace(orgKey, workspace);
}

async function main() {
  const [, , command, orgKey, jobId, datasetId] = process.argv;
  if (command === 'parse') await parseDataset(orgKey, jobId, datasetId);
  if (command === 'analyze') await analyzeDataset(orgKey, jobId, datasetId);
  if (command === 'report') await generateReport(orgKey, datasetId, jobId, [], '');
}

main().catch((error) => {
  const [, , command, orgKey, jobId, datasetId] = process.argv;
  try {
    if (orgKey && jobId) {
      const workspace = readWorkspace(orgKey);
      const job = workspace.jobs.find((item) => item.id === jobId);
      const dataset = datasetId ? workspace.datasets.find((item) => item.id === datasetId) : null;
      if (job) {
        job.status = 'failed';
        job.finishedAt = new Date().toISOString();
        job.failureReason = error instanceof Error ? error.message : String(error);
      }
      if (dataset && command === 'parse') {
        dataset.status = 'failed';
        dataset.analysisReadiness = 'analysis_blocked';
      }
      appendAudit(workspace, {
        actor: 'system',
        action: command === 'parse' ? 'dataset_parse_failed' : command === 'analyze' ? 'analysis_failed' : 'job_failed',
        resource: dataset?.name || command || 'worker',
        details: {
          dataset_id: datasetId,
          job_id: jobId,
          reason: error instanceof Error ? error.message : String(error),
        },
      });
      writeWorkspace(orgKey, workspace);
    }
  } catch {}
  console.error(error);
  process.exit(1);
});
