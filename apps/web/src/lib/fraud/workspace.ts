'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getSessionOrgScope } from '../org';
import { runIsolationForestLikeAnalysis } from './analysis';
import { createReportMetadata, downloadFraudWorkbook } from './report';
import type {
  AnalystDisposition,
  AuditEvent,
  DispositionEvent,
  PdfParseStatus,
  FraudCanonicalField,
  FraudWorkspace,
  ParseError,
  SchemaFieldProfile,
  TransactionRecord,
  UploadedDataset,
  UploadedDocument,
} from './types';

const STORAGE_PREFIX = 'fraud-ops-risk-console';
const STORAGE_EVENT = 'fraud-ops-workspace-updated';
const INDEXED_DB_NAME = 'fraud-ops-risk-console-db';
const INDEXED_DB_VERSION = 1;
const INDEXED_DB_STORE = 'workspaces';

const DEFAULT_WORKSPACE: FraudWorkspace = {
  version: 1,
  datasets: [],
  documents: [],
  analysisRuns: [],
  cases: [],
  auditEvents: [],
  reports: [],
  entityLinks: [],
  settings: {
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
  },
};

const FIELD_SYNONYMS: Record<FraudCanonicalField, string[]> = {
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

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function storageKey(orgKey: string) {
  return `${STORAGE_PREFIX}:${orgKey}`;
}

function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) {
        database.createObjectStore(INDEXED_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readWorkspaceFromIndexedDb(orgKey: string): Promise<FraudWorkspace | null> {
  const database = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, 'readonly');
    const store = transaction.objectStore(INDEXED_DB_STORE);
    const request = store.get(storageKey(orgKey));
    request.onsuccess = () => resolve((request.result as FraudWorkspace | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeWorkspaceToIndexedDb(orgKey: string, workspace: FraudWorkspace): Promise<void> {
  const database = await openWorkspaceDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, 'readwrite');
    const store = transaction.objectStore(INDEXED_DB_STORE);
    const request = store.put(workspace, storageKey(orgKey));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function writeWorkspaceRevision(orgKey: string) {
  window.localStorage.setItem(`${storageKey(orgKey)}:revision`, JSON.stringify({ updatedAt: new Date().toISOString() }));
}

function normalizeWorkspace(raw?: Partial<FraudWorkspace> | null): FraudWorkspace {
  return {
    ...DEFAULT_WORKSPACE,
    ...raw,
    datasets: raw?.datasets ?? DEFAULT_WORKSPACE.datasets,
    documents: raw?.documents ?? DEFAULT_WORKSPACE.documents,
    analysisRuns: raw?.analysisRuns ?? DEFAULT_WORKSPACE.analysisRuns,
    cases: raw?.cases ?? DEFAULT_WORKSPACE.cases,
    auditEvents: raw?.auditEvents ?? DEFAULT_WORKSPACE.auditEvents,
    reports: raw?.reports ?? DEFAULT_WORKSPACE.reports,
    entityLinks: raw?.entityLinks ?? DEFAULT_WORKSPACE.entityLinks,
    settings: {
      ...DEFAULT_WORKSPACE.settings,
      ...(raw?.settings ?? {}),
      enabledRules: raw?.settings?.enabledRules ?? DEFAULT_WORKSPACE.settings.enabledRules,
      riskBands: {
        ...DEFAULT_WORKSPACE.settings.riskBands,
        ...(raw?.settings?.riskBands ?? {}),
      },
    },
  };
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

async function readWorkspace(orgKey: string): Promise<FraudWorkspace> {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE;
  try {
    const indexedDbWorkspace = await readWorkspaceFromIndexedDb(orgKey);
    if (indexedDbWorkspace) return normalizeWorkspace(indexedDbWorkspace);
  } catch {}
  return normalizeWorkspace(safeJsonParse<FraudWorkspace>(window.localStorage.getItem(storageKey(orgKey))));
}

async function writeWorkspace(orgKey: string, workspace: FraudWorkspace) {
  if (typeof window === 'undefined') return;
  try {
    await writeWorkspaceToIndexedDb(orgKey, workspace);
    writeWorkspaceRevision(orgKey);
  } catch (error) {
    try {
      window.localStorage.setItem(storageKey(orgKey), JSON.stringify(workspace));
    } catch {
      console.error('Failed to persist fraud workspace', error);
      return;
    }
  }
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { orgKey } }));
}

function detectField(header: string): FraudCanonicalField | undefined {
  const normalized = header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return (Object.entries(FIELD_SYNONYMS) as Array<[FraudCanonicalField, string[]]>).find(([, aliases]) =>
    aliases.includes(normalized)
  )?.[0];
}

function normalizeCellValue(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function buildSchema(rows: Record<string, unknown>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return headers.map<SchemaFieldProfile>((name) => {
    const values = rows.map((row) => normalizeCellValue(row[name])).filter((value) => value !== null && value !== '');
    const numericCount = values.filter((value) => typeof value === 'number').length;
    const dateCount = values.filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value))).length;
    const booleanCount = values.filter((value) => typeof value === 'boolean' || ['true', 'false', 'yes', 'no', '0', '1'].includes(String(value).toLowerCase())).length;
    let dataType: SchemaFieldProfile['dataType'] = 'empty';
    if (values.length) {
      if (numericCount === values.length) dataType = 'numeric';
      else if (dateCount >= Math.max(1, Math.floor(values.length * 0.6))) dataType = 'datetime';
      else if (booleanCount >= Math.max(1, Math.floor(values.length * 0.8))) dataType = 'boolean';
      else if (numericCount > 0 || dateCount > 0) dataType = 'mixed';
      else dataType = 'text';
    }
    return {
      name,
      mappedTo: detectField(name),
      dataType,
      sampleValues: values.slice(0, 4).map((value) => String(value)),
      nonEmptyCount: values.length,
    };
  });
}

function normalizeRecords(rows: Record<string, unknown>[], schema: SchemaFieldProfile[]): TransactionRecord[] {
  const mapping = new Map(schema.map((field) => [field.name, field.mappedTo]));
  return rows.map((row, index) => {
    const values = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, normalizeCellValue(value)])
    ) as Record<string, string | number | boolean | null>;
    const normalized: TransactionRecord['normalized'] = {};
    mapping.forEach((mappedTo, key) => {
      if (!mappedTo) return;
      normalized[mappedTo] = values[key];
    });
    return {
      id: String(values.transaction_id ?? values.id ?? createId(`row${index + 1}`)),
      rowNumber: index + 1,
      values,
      normalized,
    };
  });
}

async function parseCsvFile(file: File) {
  const text = await file.text();
  const parseResult = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: (header) => header.trim(),
  });
  const parseErrors: ParseError[] = parseResult.errors.map((error) => ({
    row: typeof error.row === 'number' ? error.row + 1 : undefined,
    message: error.message,
  }));
  const rows = parseResult.data.filter((row) => Object.values(row).some((value) => value !== null && value !== ''));
  return { rows, parseErrors, fileKind: 'csv' as const };
}

async function parseExcelFile(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  return { rows, parseErrors: [] as ParseError[], fileKind: 'excel' as const, availableSheets: workbook.SheetNames, selectedSheet: sheetName };
}

async function extractPdfText(file: File) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data } as any).promise;
    const parts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) parts.push(pageText);
    }
    const extractedText = parts.join('\n\n').trim();
    return {
      extractedText,
      parseStatus: (extractedText ? 'parsed' : 'image_only_or_unparsed') as PdfParseStatus,
    };
  } catch {
    return { extractedText: '', parseStatus: 'error' as PdfParseStatus };
  }
}

function appendAuditEvent(workspace: FraudWorkspace, event: Omit<AuditEvent, 'id' | 'at'>): FraudWorkspace {
  return {
    ...workspace,
    auditEvents: [
      {
        id: createId('audit'),
        at: new Date().toISOString(),
        ...event,
      },
      ...workspace.auditEvents,
    ],
  };
}

function defaultActor() {
  return 'investigator@console';
}

function remapRecords(records: TransactionRecord[], schema: SchemaFieldProfile[]): TransactionRecord[] {
  const mapping = new Map(schema.map((field) => [field.name, field.mappedTo]));
  return records.map((record) => {
    const normalized: TransactionRecord['normalized'] = {};
    mapping.forEach((mappedTo, key) => {
      if (!mappedTo) return;
      normalized[mappedTo] = record.values[key];
    });
    return { ...record, normalized };
  });
}

export function useFraudWorkspace() {
  const [orgKey, setOrgKey] = useState<string>('workspace-default');
  const [orgName, setOrgName] = useState<string>('Current workspace');
  const [workspace, setWorkspace] = useState<FraudWorkspace>(DEFAULT_WORKSPACE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadOrgScope() {
      try {
        const scope = await getSessionOrgScope();
        if (!mounted) return;
        setOrgKey(scope.orgKey);
        setOrgName(scope.orgName ?? 'Current workspace');
        setWorkspace(await readWorkspace(scope.orgKey));
      } catch {
        if (!mounted) return;
        setWorkspace(await readWorkspace('workspace-default'));
      } finally {
        if (mounted) setReady(true);
      }
    }
    void loadOrgScope();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== storageKey(orgKey) && event.key !== `${storageKey(orgKey)}:revision`) return;
      void readWorkspace(orgKey).then(setWorkspace);
    };
    const onCustom = (event: Event) => {
      const custom = event as CustomEvent<{ orgKey?: string }>;
      if (custom.detail?.orgKey && custom.detail.orgKey !== orgKey) return;
      void readWorkspace(orgKey).then(setWorkspace);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(STORAGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STORAGE_EVENT, onCustom as EventListener);
    };
  }, [orgKey, ready]);

  const persist = useCallback(
    (updater: (current: FraudWorkspace) => FraudWorkspace) => {
      setWorkspace((current) => {
        const next = updater(current);
        void writeWorkspace(orgKey, next);
        return next;
      });
    },
    [orgKey]
  );

  const activeDataset = useMemo(
    () => workspace.datasets.find((dataset) => dataset.id === workspace.activeDatasetId) ?? workspace.datasets[0] ?? null,
    [workspace.activeDatasetId, workspace.datasets]
  );

  const latestRun = useMemo(
    () =>
      activeDataset
        ? workspace.analysisRuns.find((run) => run.datasetId === activeDataset.id) ??
          [...workspace.analysisRuns].find((run) => run.datasetId === activeDataset.id) ??
          null
        : null,
    [activeDataset, workspace.analysisRuns]
  );

  const flaggedRecordMap = useMemo(
    () => new Map((latestRun?.flaggedRecords ?? []).map((record) => [record.recordId, record])),
    [latestRun]
  );

  const uploadDataset = useCallback(
    async (file: File) => {
      const parsed = file.name.toLowerCase().endsWith('.csv') ? await parseCsvFile(file) : await parseExcelFile(file);
      const schema = buildSchema(parsed.rows);
      const dataset: UploadedDataset = {
        id: createId('dataset'),
        name: file.name,
        fileKind: parsed.fileKind,
        uploadedAt: new Date().toISOString(),
        rowCount: parsed.rows.length,
        columnCount: parsed.rows.length ? Object.keys(parsed.rows[0]).length : 0,
        status: parsed.parseErrors.length ? 'error' : 'ready',
        parseErrors: parsed.parseErrors,
        availableSheets: 'availableSheets' in parsed ? parsed.availableSheets : ['Sheet1'],
        selectedSheet: 'selectedSheet' in parsed ? parsed.selectedSheet : 'Sheet1',
        schema,
        records: normalizeRecords(parsed.rows, schema),
      };

      persist((current) =>
        appendAuditEvent(
          {
            ...current,
            activeDatasetId: dataset.id,
            datasets: [dataset, ...current.datasets],
          },
          {
            actor: defaultActor(),
            action: 'dataset_uploaded',
            resource: dataset.name,
            details: { dataset_id: dataset.id, rows: dataset.rowCount, columns: dataset.columnCount, file_kind: dataset.fileKind, sheet: dataset.selectedSheet ?? '' },
          }
        )
      );
      return dataset;
    },
    [persist]
  );

  const uploadPdf = useCallback(
    async (file: File) => {
      const parsed = await extractPdfText(file);
      const document: UploadedDocument = {
        id: createId('doc'),
        name: file.name,
        uploadedAt: new Date().toISOString(),
        size: file.size,
        parseStatus: parsed.parseStatus,
        snippet: parsed.extractedText.slice(0, 220) || 'Image-only PDF or no extractable text detected.',
        extractedText: parsed.extractedText,
        linkedDatasetId: activeDataset?.id,
        linkedCaseIds: [],
        linkedRecordIds: [],
      };

      persist((current) =>
        appendAuditEvent(
          {
            ...current,
            documents: [document, ...current.documents],
          },
          {
            actor: defaultActor(),
            action: 'document_uploaded',
            resource: document.name,
            details: { document_id: document.id, parse_status: document.parseStatus },
          }
        )
      );
      return document;
    },
    [activeDataset?.id, persist]
  );

  const runDetection = useCallback(() => {
    if (!activeDataset) return null;
    let outcome;
    try {
      outcome = runIsolationForestLikeAnalysis(activeDataset, workspace.documents, workspace.settings);
    } catch (error) {
      persist((current) =>
        appendAuditEvent(
          current,
          {
            actor: defaultActor(),
            action: 'analysis_blocked',
            resource: activeDataset.name,
            details: {
              dataset_id: activeDataset.id,
              reason: error instanceof Error ? error.message : 'Analysis blocked.',
            },
          }
        )
      );
      throw error;
    }
    const report = createReportMetadata(activeDataset);
    persist((current) => {
      const linkedDocuments = current.documents.map((document) => ({
        ...document,
        linkedCaseIds: outcome.cases.map((item) => item.id),
        linkedRecordIds: outcome.cases.map((item) => item.recordId),
      }));
      const next = {
        ...current,
        documents: linkedDocuments,
        analysisRuns: [outcome.run, ...current.analysisRuns.filter((run) => run.datasetId !== activeDataset.id)],
        cases: [...outcome.cases, ...current.cases.filter((item) => item.datasetId !== activeDataset.id)],
        reports: [report, ...current.reports.filter((item) => item.datasetId !== activeDataset.id)],
        entityLinks: outcome.entityLinks,
      };
      return appendAuditEvent(
        appendAuditEvent(next, {
          actor: defaultActor(),
          action: 'report_generated',
          resource: report.filename,
          details: { dataset_id: activeDataset.id, report_id: report.id },
        }),
        {
          actor: defaultActor(),
          action: 'analysis_completed',
          resource: activeDataset.name,
          details: {
            dataset_id: activeDataset.id,
            suspicious_transactions: outcome.run.metrics.suspiciousTransactions,
            anomaly_rate: outcome.run.metrics.anomalyRate ?? 0,
          },
        }
      );
    });
    return outcome.run;
  }, [activeDataset, persist, workspace.documents, workspace.settings]);

  const setActiveDataset = useCallback(
    (datasetId: string) => {
      persist((current) => ({
        ...current,
        activeDatasetId: datasetId,
      }));
    },
    [persist]
  );

  const updateThreshold = useCallback(
    (threshold: number) => {
      persist((current) =>
        appendAuditEvent(
          {
            ...current,
            settings: { ...current.settings, anomalyThreshold: threshold },
          },
          {
            actor: defaultActor(),
            action: 'settings_updated',
            resource: 'analysis_threshold',
            details: { anomaly_threshold: threshold },
          }
        )
      );
    },
    [persist]
  );

  const updateSettings = useCallback(
    (partial: Partial<FraudWorkspace['settings']>) => {
      persist((current) =>
        appendAuditEvent(
          {
            ...current,
            settings: { ...current.settings, ...partial },
          },
          {
            actor: defaultActor(),
            action: 'settings_updated',
            resource: 'fraud_settings',
            details: Object.fromEntries(Object.entries(partial).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)])),
          }
        )
      );
    },
    [persist]
  );

  const updateColumnMapping = useCallback(
    (datasetId: string, columnName: string, mappedTo?: FraudCanonicalField) => {
      persist((current) => {
        const datasets = current.datasets.map((dataset) => {
          if (dataset.id !== datasetId) return dataset;
          const schema = dataset.schema.map((field) => (field.name === columnName ? { ...field, mappedTo } : field));
          return {
            ...dataset,
            schema,
            records: remapRecords(dataset.records, schema),
          };
        });
        return appendAuditEvent(
          {
            ...current,
            datasets,
          },
          {
            actor: defaultActor(),
            action: 'column_mapping_updated',
            resource: columnName,
            details: { dataset_id: datasetId, mapped_to: mappedTo ?? 'unmapped' },
          }
        );
      });
    },
    [persist]
  );

  const clearActiveDataset = useCallback(() => {
    if (!activeDataset) return;
    persist((current) =>
      appendAuditEvent(
        {
          ...current,
          activeDatasetId: current.datasets.find((dataset) => dataset.id !== activeDataset.id)?.id,
          datasets: current.datasets.filter((dataset) => dataset.id !== activeDataset.id),
          analysisRuns: current.analysisRuns.filter((run) => run.datasetId !== activeDataset.id),
          cases: current.cases.filter((item) => item.datasetId !== activeDataset.id),
          reports: current.reports.filter((item) => item.datasetId !== activeDataset.id),
          entityLinks: current.entityLinks.filter((item) => !item.linkedRecordIds.some((recordId) => current.cases.find((caseItem) => caseItem.datasetId === activeDataset.id && caseItem.recordId === recordId))),
        },
        {
          actor: defaultActor(),
          action: 'dataset_cleared',
          resource: activeDataset.name,
          details: { dataset_id: activeDataset.id },
        }
      )
    );
  }, [activeDataset, persist]);

  const generateReport = useCallback(
    (datasetId: string) => {
      const dataset = workspace.datasets.find((item) => item.id === datasetId);
      if (!dataset) return null;
      const report = createReportMetadata(dataset);
      persist((current) =>
        appendAuditEvent(
          {
            ...current,
            reports: [report, ...current.reports.filter((item) => item.datasetId !== dataset.id)],
          },
          {
            actor: defaultActor(),
            action: 'report_generated',
            resource: report.filename,
            details: { dataset_id: dataset.id, report_id: report.id },
          }
        )
      );
      downloadFraudWorkbook(workspace, dataset, report);
      return report;
    },
    [persist, workspace]
  );

  const downloadLatestReport = useCallback(
    (datasetId: string) => {
      const dataset = workspace.datasets.find((item) => item.id === datasetId);
      const report = workspace.reports.find((item) => item.datasetId === datasetId);
      if (!dataset || !report) return;
      downloadFraudWorkbook(workspace, dataset, report);
      persist((current) =>
        appendAuditEvent(current, {
          actor: defaultActor(),
          action: 'report_downloaded',
          resource: report.filename,
          details: { dataset_id: dataset.id, report_id: report.id },
        })
      );
    },
    [persist, workspace]
  );

  const updateCaseDisposition = useCallback(
    (caseId: string, disposition: AnalystDisposition, note?: string, actor = 'analyst@console') => {
      persist((current) => {
        const cases = current.cases.map((item) => {
          if (item.id !== caseId) return item;
          const event: DispositionEvent = {
            at: new Date().toISOString(),
            actor,
            disposition,
            note,
          };
          return {
            ...item,
            status: disposition,
            note: note ?? item.note,
            reviewedBy: actor,
            reviewedAt: event.at,
            dispositionHistory: [event, ...item.dispositionHistory],
          };
        });
        return appendAuditEvent(
          {
            ...current,
            cases,
          },
          {
            actor,
            action: 'case_disposition_updated',
            resource: caseId,
            details: { disposition, note: note ?? '' },
          }
        );
      });
    },
    [persist]
  );

  return {
    ready,
    orgKey,
    orgName,
    workspace,
    activeDataset,
    latestRun,
    flaggedRecordMap,
    uploadDataset,
    uploadPdf,
    runDetection,
    setActiveDataset,
    updateThreshold,
    updateSettings,
    updateColumnMapping,
    clearActiveDataset,
    generateReport,
    downloadLatestReport,
    updateCaseDisposition,
  };
}
