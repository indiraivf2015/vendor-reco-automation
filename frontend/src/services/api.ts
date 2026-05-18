import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// ---- Types ----

export interface ReconRun {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  trigger: 'SCHEDULED' | 'MANUAL' | 'UPLOAD';
  totalP2pVendors: number;
  totalErpVendors: number;
  commonVendors: number;
  missingInErpCount: number;
  missingInP2pCount: number;
  totalExceptions: number;
  matchRatePct: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  triggeredBy: string | null;
  errorMessage: string | null;
}

export interface CategorySummary {
  id: string;
  category: string;
  missingCount: number;
  p2pUnique: number;
  erpUnique: number;
  p2pMissing: number;
  erpMissing: number;
  matched: number;
}

export interface DashboardData {
  latestRun: ReconRun | null;
  totalRuns: number;
  openExceptions: number;
  categorySummary: CategorySummary[];
  trend: { id: string; date: string; exceptions: number; matchRatePct: number; common: number }[];
}

export interface LedgerRow {
  id: string;
  vendorCode: string;
  /** Composite-key second half (Sprint 4.4). 'UNSPECIFIED' when source had no city. */
  city: string;
  vendorUniqueId: string;
  vendorNameP2p: string; vendorNameErp: string; vendorNameMatch: boolean;
  vendorCodeP2p: string; vendorCodeErp: string; vendorCodeMatch: boolean;
  panP2p: string; panErp: string; panMatch: boolean;
  gstP2p: string; gstErp: string; gstMatch: boolean;
  msmeP2p: string; msmeErp: string; msmeMatch: boolean;
  ifscP2p: string; ifscErp: string; ifscMatch: boolean;
  bankAccountP2p: string; bankAccountErp: string; bankAccountMatch: boolean;
  bankNameP2p: string; bankNameErp: string; bankNameMatch: boolean;
  tdsP2p: string; tdsErp: string; tdsMatch: boolean;
  presentInP2p: boolean;
  presentInErp: boolean;
  mismatchCount: number;
}

export interface ReconException {
  id: string;
  vendorCode: string;
  /** Composite-key second half (Sprint 4.4). */
  city: string;
  vendorName: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'IGNORED';
  fieldName: string | null;
  p2pValue: string | null;
  erpValue: string | null;
  description: string;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  runId?: string;
  createdAt: string;
  /** Present when `type === 'PAN_MISMATCH'` (API-enriched, same rules as reconciliation). */
  p2pValueNormalized?: string | null;
  erpValueNormalized?: string | null;
  p2pContainsSpaces?: boolean;
  erpContainsSpaces?: boolean;
  p2pIsEmpty?: boolean;
  erpIsEmpty?: boolean;
  normalizedPanMatch?: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userIdentifier: string;
  details: string;
  createdAt: string;
}

// ---- API calls ----

export const dashboardApi = {
  get: () => api.get<DashboardData>('/reconciliation/dashboard').then(r => r.data),
};

export const reconApi = {
  triggerRun: () => api.post<ReconRun>('/reconciliation/run', { triggeredBy: 'dashboard-user' }).then(r => r.data),
  listRuns: () => api.get<ReconRun[]>('/reconciliation/runs').then(r => r.data),
  getRun: (id: string) => api.get<ReconRun>(`/reconciliation/runs/${id}`).then(r => r.data),
  getRunSummary: (id: string) => api.get<{ run: ReconRun; summary: CategorySummary[] }>(`/reconciliation/runs/${id}/summary`).then(r => r.data),
  getLedger: (id: string, params?: Record<string, any>) =>
    api.get<Paginated<LedgerRow>>(`/reconciliation/runs/${id}/ledger`, { params }).then(r => r.data),
};

export interface GroupedExceptionMismatch {
  id: string;
  field: string;
  severity: ReconException['severity'];
  p2pValue: string | null;
  erpValue: string | null;
  type: string;
  status: ReconException['status'];
  description: string | null;
}

export interface GroupedExceptionVendorBlock {
  vendorCode: string;
  city: string;
  vendorName: string;
  issueCount: number;
  mismatches: GroupedExceptionMismatch[];
}

export interface GroupedExceptionsResponse {
  groups: GroupedExceptionVendorBlock[];
  totalGroups: number;
  totalExceptions: number;
  page: number;
  pageSize: number;
}

export const exceptionsApi = {
  list: (params?: {
    runId?: string;
    q?: string;
    severity?: string;
    status?: string;
    type?: string;
    vendorCode?: string;
    page?: number;
    pageSize?: number;
  }) =>
    api.get<Paginated<ReconException>>('/exceptions', { params }).then(r => r.data),
  getGrouped: (params?: {
    runId?: string;
    q?: string;
    severity?: string;
    status?: string;
    type?: string;
    vendorCode?: string;
    page?: number;
    pageSize?: number;
  }) =>
    api.get<GroupedExceptionsResponse>('/exceptions/grouped', { params }).then(r => r.data),
  counts: (runId?: string) =>
    api.get('/exceptions/counts', { params: { runId } }).then(r => r.data),
  updateStatus: (id: string, body: { status: string; resolutionNotes?: string; resolvedBy?: string }) =>
    api.patch<ReconException>(`/exceptions/${id}/status`, body).then(r => r.data),
};

export const vendorsApi = {
  list: (source: string, params?: Record<string, any>) =>
    api.get<Paginated<any>>(`/vendors/${source}`, { params }).then(r => r.data),
  stats: () => api.get('/vendors/stats').then(r => r.data),
};

export interface IngestionInsights {
  totalAnalysed: number;
  missingCity: number;
  missingState: number;
  topCities: Array<{ value: string; count: number }>;
  topStates: Array<{ value: string; count: number }>;
  missingVendorName: number;
  missingPan: number;
  missingGst: number;
  missingMsme: number;
  missingIfsc: number;
  missingBankAccount: number;
  missingBankName: number;
  missingTds: number;
  invalidPan: number;
  invalidGst: number;
  invalidIfsc: number;
  duplicateVendorCodes: number;
  duplicateCodesWithConflictingName: number;
  topVendorGroups: Array<{ value: string; count: number }>;
  topBankNames: Array<{ value: string; count: number }>;
  topPaymentTerms: Array<{ value: string; count: number }>;
  invalidPanSamples: Array<{ vendorCode: string; vendorName: string; value: string }>;
  invalidGstSamples: Array<{ vendorCode: string; vendorName: string; value: string }>;
  invalidIfscSamples: Array<{ vendorCode: string; vendorName: string; value: string }>;
}

export interface JobState {
  id: string;
  source: 'P2P' | 'ERP' | 'AUTO';
  status: 'QUEUED' | 'PARSING' | 'INGESTING' | 'COMPLETED' | 'FAILED';
  rowsProcessed: number;
  uniqueVendors: number;
  saved: number;
  chunksCompleted: number;
  totalChunks?: number;
  percentComplete: number;
  message?: string;
  insights: IngestionInsights;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  filename: string;
  fileSizeMB: number;
  triggeredReconRunId?: string;
  columnWarnings?: string[];
  p2pColumnMapping?: Record<string, number>;
  erpColumnMapping?: Record<string, number>;
}

export const uploadApi = {
  /** Start async upload — returns { jobId } immediately. */
  upload: (file: File, source?: string, runRecon?: boolean, replaceDataset?: boolean) => {
    const fd = new FormData();
    fd.append('file', file);
    const params: any = {};
    if (source) params.source = source;
    if (runRecon) params.runRecon = 'true';
    if (replaceDataset) params.replaceDataset = 'true';
    return api.post<{ jobId: string; status: string; pollUrl: string }>('/uploads/vendors', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params,
    }).then(r => r.data);
  },
};

export const jobsApi = {
  get: (id: string) => api.get<JobState>(`/jobs/${id}`).then(r => r.data),
  list: () => api.get<JobState[]>('/jobs').then(r => r.data),
};

export const auditApi = {
  list: () => api.get<AuditEntry[]>('/audit').then(r => r.data),
};

export const reportsApi = {
  downloadLatest: () => api.get('/reports/latest.xlsx', { responseType: 'blob' }).then(r => {
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vendor_recon_latest.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }),
  downloadRun: (id: string) => api.get(`/reports/runs/${id}.xlsx`, { responseType: 'blob' }).then(r => {
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor_recon_${id.slice(0, 8)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }),
};

export default api;
