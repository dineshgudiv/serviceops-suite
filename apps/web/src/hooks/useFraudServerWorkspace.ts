'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlaggedDetailResponse, FlaggedQuery, FraudDatasetMutation, FraudPagedResult, FraudServerWorkspace, FraudUploadSessionStatus, FraudWorkspaceResponse, ServerCaseRecord, ServerFlaggedRow } from '../lib/fraud/server-types';
import type { WorkspaceSettings } from '../lib/fraud/types';

const ACTIVE_UPLOAD_KEY = 'fraud-ops-active-upload';

type UploadState = {
  uploadId?: string;
  jobId?: string;
  datasetId?: string;
  filename?: string;
  size?: number;
  kind?: 'dataset' | 'pdf';
  progressPct: number;
  status: 'idle' | 'uploading' | 'completing' | 'failed' | 'cancelled' | 'completed';
  error?: string;
};

type PersistedUploadState = UploadState & {
  fileHandleKey?: string;
};

const HANDLE_DB = 'fraud-ops-upload-handles';
const HANDLE_STORE = 'handles';

async function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(key: string, handle: FileSystemFileHandle) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    const req = tx.objectStore(HANDLE_STORE).put(handle, key);
    req.onsuccess = () => resolve(null);
    req.onerror = () => reject(req.error);
  });
}

async function readHandle(key: string): Promise<FileSystemFileHandle | null> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly');
    const req = tx.objectStore(HANDLE_STORE).get(key);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function persistUploadState(state: PersistedUploadState | null) {
  if (!state) {
    window.localStorage.removeItem(ACTIVE_UPLOAD_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_UPLOAD_KEY, JSON.stringify(state));
}

function readPersistedUploadState(): PersistedUploadState | null {
  const text = window.localStorage.getItem(ACTIVE_UPLOAD_KEY);
  if (!text) return null;
  try {
    return JSON.parse(text) as PersistedUploadState;
  } catch {
    return null;
  }
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data?.message ?? data?.error?.message ?? 'Request failed.');
  return data as T;
}

function normalizeResumablePickerError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  if (!message) return 'Resume-enabled upload is unavailable in this browser. Use the standard file picker or switch to Chromium.';
  if (message.includes('showOpenFilePicker')) {
    return 'Resume-enabled upload could not open the browser file picker. Use the standard file picker, or retry in a Chromium browser with the page in focus.';
  }
  if (message.includes('File System Access API')) {
    return 'Resume-enabled upload is available only in Chromium browsers that support the File System Access API.';
  }
  if (message.includes('AbortError')) {
    return 'Resume-enabled file selection was cancelled before a file was chosen.';
  }
  return message;
}

export function useFraudServerWorkspace() {
  const [workspace, setWorkspace] = useState<FraudServerWorkspace | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>({ progressPct: 0, status: 'idle' });
  const [resumableSessions, setResumableSessions] = useState<FraudUploadSessionStatus[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runDetectionError, setRunDetectionError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspacePermissions, setWorkspacePermissions] = useState<{ canDeleteDatasets: boolean; role: string; authenticated: boolean } | null>(null);

  const refresh = useCallback(() => setRefreshTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await json<FraudWorkspaceResponse>(await fetch('/api/fraud/workspace', { cache: 'no-store' }));
        if (!cancelled) {
          setWorkspace(data.workspace);
          setWorkspacePermissions(data.permissions ?? null);
          setWorkspaceError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setWorkspaceError(cause instanceof Error ? cause.message : 'Failed to load the fraud workspace.');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    const interval = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshTick]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const persisted = readPersistedUploadState();
    if (persisted) {
      setUploadState({
        uploadId: persisted.uploadId,
        jobId: persisted.jobId,
        datasetId: persisted.datasetId,
        filename: persisted.filename,
        size: persisted.size,
        kind: persisted.kind,
        progressPct: persisted.progressPct,
        status: persisted.status,
        error: persisted.error,
      });
    }
    void fetch('/api/fraud/upload/sessions', { cache: 'no-store' }).then((res) => json<{ sessions: FraudUploadSessionStatus[] }>(res)).then((data) => {
      setResumableSessions(data.sessions.filter((session) => !session.completedAt && !session.cancelledAt));
    }).catch(() => {});
  }, [refreshTick]);

  const activeDataset = useMemo(
    () => workspace?.datasets.find((dataset) => dataset.id === workspace.activeDatasetId) ?? workspace?.datasets[0] ?? null,
    [workspace]
  );
  const latestRun = useMemo(
    () => (activeDataset ? workspace?.runs.find((run) => run.datasetId === activeDataset.id) ?? null : null),
    [activeDataset, workspace]
  );

  const uploadDataset = useCallback(async (file: File, kind: 'dataset' | 'pdf' = 'dataset', fileHandle?: FileSystemFileHandle | null) => {
    const init = await json<{ uploadId: string; jobId: string; datasetId: string; chunkSize: number }>(
      await fetch('/api/fraud/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size: file.size, kind }),
      })
    );
    const handleKey = fileHandle ? `${init.uploadId}:handle` : undefined;
    if (fileHandle && handleKey) {
      await saveHandle(handleKey, fileHandle);
    }
    setUploadState({ uploadId: init.uploadId, jobId: init.jobId, datasetId: init.datasetId, filename: file.name, size: file.size, kind, progressPct: 0, status: 'uploading' });
    persistUploadState({ uploadId: init.uploadId, jobId: init.jobId, datasetId: init.datasetId, filename: file.name, size: file.size, kind, progressPct: 0, status: 'uploading', fileHandleKey: handleKey });
    await resumeUpload(init.uploadId, file, handleKey);
    refresh();
    return init.datasetId;
  }, [refresh]);

  const resumeUpload = useCallback(async (uploadId: string, preferredFile?: File | null, handleKey?: string) => {
    const session = await json<FraudUploadSessionStatus>(await fetch(`/api/fraud/upload/${uploadId}`, { cache: 'no-store' }));
    let file = preferredFile ?? null;
    let persistedHandleKey = handleKey;
    if (!file) {
      const persisted = readPersistedUploadState();
      persistedHandleKey = persisted?.fileHandleKey ?? persistedHandleKey;
      if (persistedHandleKey) {
        const handle = await readHandle(persistedHandleKey);
        if (handle) {
          const resumableHandle = handle as FileSystemFileHandle & {
            queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
            requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
          };
          const permission = resumableHandle.queryPermission ? await resumableHandle.queryPermission({ mode: 'read' }) : 'granted';
          if (permission === 'granted' || (resumableHandle.requestPermission && (await resumableHandle.requestPermission({ mode: 'read' })) === 'granted')) {
            file = await handle.getFile();
          }
        }
      }
    }
    if (!file) throw new Error('Resume requires the original local file handle. Use the resume-enabled picker on Chromium browsers.');
    const totalChunks = Math.ceil(file.size / session.chunkSize);
    const nextChunk = Math.floor((session.uploadedBytes ?? 0) / session.chunkSize);
    setUploadState({ uploadId: session.uploadId, jobId: session.jobId, datasetId: session.datasetId, filename: session.originalFilename, size: session.size, kind: session.kind, progressPct: Math.round((session.uploadedBytes / session.size) * 100), status: 'uploading' });
    for (let index = nextChunk; index < totalChunks; index += 1) {
      const chunk = file.slice(index * session.chunkSize, Math.min(file.size, (index + 1) * session.chunkSize));
      await fetch(`/api/fraud/upload/${session.uploadId}`, {
        method: 'PUT',
        headers: { 'x-fraud-chunk-index': String(index), 'Content-Type': 'application/octet-stream' },
        body: await chunk.arrayBuffer(),
      });
      const progressPct = Math.round(((index + 1) / totalChunks) * 100);
      setUploadState((current) => ({ ...current, progressPct, status: 'uploading' }));
      persistUploadState({ uploadId: session.uploadId, jobId: session.jobId, datasetId: session.datasetId, filename: session.originalFilename, size: session.size, kind: session.kind, progressPct, status: 'uploading', fileHandleKey: persistedHandleKey });
    }
    setUploadState((current) => ({ ...current, status: 'completing' }));
    persistUploadState({ uploadId: session.uploadId, jobId: session.jobId, datasetId: session.datasetId, filename: session.originalFilename, size: session.size, kind: session.kind, progressPct: 100, status: 'completing', fileHandleKey: persistedHandleKey });
    await json(await fetch(`/api/fraud/upload/${session.uploadId}/complete`, { method: 'POST' }));
    setUploadState((current) => ({ ...current, progressPct: 100, status: 'completed' }));
    setResumableSessions((current) => current.filter((item) => item.uploadId !== session.uploadId));
    persistUploadState(null);
  }, []);

  const cancelUpload = useCallback(async (uploadId?: string) => {
    const targetUploadId = uploadId ?? uploadState.uploadId;
    if (!targetUploadId) return;
    await json(await fetch(`/api/fraud/upload/${targetUploadId}/cancel`, { method: 'POST' }));
    setUploadState((current) => ({ ...current, status: 'cancelled', error: 'Upload cancelled by operator.' }));
    setResumableSessions((current) => current.filter((item) => item.uploadId !== targetUploadId));
    persistUploadState(null);
    refresh();
  }, [refresh, uploadState.uploadId]);

  const cancelJob = useCallback(async (jobId: string) => {
    await json(await fetch(`/api/fraud/jobs/${jobId}/cancel`, { method: 'POST' }));
    refresh();
  }, [refresh]);

  const pickResumableFile = useCallback(async (): Promise<{ file: File; handle: FileSystemFileHandle | null }> => {
    if ('showOpenFilePicker' in window) {
      const [handle] = await (window as typeof window & { showOpenFilePicker: Function }).showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Fraud datasets', accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm', '.xlsb', '.xls'] } }],
      });
      const file = await handle.getFile();
      return { file, handle };
    }
    throw new Error('Resume-enabled file picking is available only in browsers that support the File System Access API.');
  }, []);

  const runDetection = useCallback(async (datasetId?: string) => {
    const targetId = datasetId ?? activeDataset?.id;
    if (!targetId) return null;
    setRunDetectionError(null);
    try {
      const response = await json<{ jobId: string }>(
        await fetch('/api/fraud/analysis/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datasetId: targetId }),
        })
      );
      refresh();
      return response.jobId;
    } catch (cause) {
      setRunDetectionError(cause instanceof Error ? cause.message : 'Failed to start analysis.');
      return null;
    }
  }, [activeDataset?.id, refresh]);

  const saveSettings = useCallback(async (settings: WorkspaceSettings) => {
    setSavingSettings(true);
    try {
      const response = await json<{ settings: WorkspaceSettings; message: string }>(
        await fetch('/api/fraud/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings }),
        })
      );
      refresh();
      return response;
    } finally {
      setSavingSettings(false);
    }
  }, [refresh]);

  const resetSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      const response = await json<{ settings: WorkspaceSettings; message: string }>(
        await fetch('/api/fraud/settings', { method: 'DELETE' })
      );
      refresh();
      return response;
    } finally {
      setSavingSettings(false);
    }
  }, [refresh]);

  const getFlaggedPage = useCallback(async (datasetId: string, page: number, pageSize: number, query?: FlaggedQuery) => {
    const params = new URLSearchParams({ datasetId, page: String(page), pageSize: String(pageSize) });
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    return json<FraudPagedResult<ServerFlaggedRow>>(
      await fetch(`/api/fraud/results/flagged?${params.toString()}`, { cache: 'no-store' })
    );
  }, []);

  const getCasesPage = useCallback(async (datasetId: string, page: number, pageSize: number) => {
    return json<FraudPagedResult<ServerCaseRecord>>(
      await fetch(`/api/fraud/results/cases?datasetId=${encodeURIComponent(datasetId)}&page=${page}&pageSize=${pageSize}`, { cache: 'no-store' })
    );
  }, []);

  const mutateCase = useCallback(async (
    datasetId: string,
    caseId: string,
    payload: {
      status?: 'new' | 'under_review' | 'escalated' | 'confirmed_fraud' | 'false_positive' | 'closed';
      note?: string;
    }
  ) => {
    const response = await json<{ caseRecord: ServerCaseRecord }>(
      await fetch(`/api/fraud/results/cases/${encodeURIComponent(caseId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, ...payload }),
      })
    );
    refresh();
    return response.caseRecord;
  }, [refresh]);

  const getFlaggedDetail = useCallback(async (datasetId: string, rowId: string) => {
    return json<FlaggedDetailResponse>(
      await fetch(`/api/fraud/results/flagged/${encodeURIComponent(rowId)}?datasetId=${encodeURIComponent(datasetId)}`, { cache: 'no-store' })
    );
  }, []);

  const mutateFlaggedRow = useCallback(async (
    datasetId: string,
    rowId: string,
    payload: {
      action: 'create_case' | 'mark_fraud' | 'mark_legitimate' | 'update_status' | 'attach_evidence';
      status?: 'new' | 'under_investigation' | 'confirmed_fraud' | 'false_positive' | 'closed';
      evidenceType?: 'note' | 'document' | 'screenshot_reference';
      evidenceValue?: string;
    }
  ) => {
    const response = await json<{ row: ServerFlaggedRow; caseRecord: ServerCaseRecord | null }>(
      await fetch(`/api/fraud/results/flagged/${encodeURIComponent(rowId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, ...payload }),
      })
    );
    refresh();
    return response;
  }, [refresh]);

  const updateDatasetConfig = useCallback(async (mutation: FraudDatasetMutation) => {
    const response = await json<{ dataset: FraudServerWorkspace['datasets'][number] }>(
      await fetch(`/api/fraud/datasets/${mutation.datasetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation),
      })
    );
    refresh();
    return response.dataset;
  }, [refresh]);

  const deleteDataset = useCallback(async (datasetId: string, force = false) => {
    const query = force ? '?force=1' : '';
    const response = await json<{
      success: boolean;
      datasetId: string;
      datasetName: string;
      deletionMode: 'hard_delete';
      removed: { runs: number; cases: number; reports: number; jobs: number; documents: number };
      nextActiveDatasetId?: string;
    }>(
      await fetch(`/api/fraud/datasets/${encodeURIComponent(datasetId)}${query}`, {
        method: 'DELETE',
      })
    );
    refresh();
    return response;
  }, [refresh]);

  const getDatasetPreview = useCallback(async (datasetId: string, page: number, pageSize: number) => {
    return json<{ headers: string[]; page: number; pageSize: number; total: number; rows: Array<Record<string, string | number | boolean | null>> }>(
      await fetch(`/api/fraud/datasets/${datasetId}/preview?page=${page}&pageSize=${pageSize}`, { cache: 'no-store' })
    );
  }, []);

  return {
    ready,
    refresh,
    workspace,
    activeDataset,
    latestRun,
    jobs: workspace?.jobs ?? [],
    resumableSessions,
    uploadState,
    uploadDataset,
    resumeUpload,
    cancelUpload,
    cancelJob,
    pickResumableFile,
    normalizeResumablePickerError,
    runDetection,
    saveSettings,
    resetSettings,
    savingSettings,
    runDetectionError,
    setRunDetectionError,
    workspaceError,
    workspacePermissions,
    updateDatasetConfig,
    deleteDataset,
    getDatasetPreview,
    getFlaggedPage,
    getFlaggedDetail,
    mutateFlaggedRow,
    getCasesPage,
    mutateCase,
  };
}
