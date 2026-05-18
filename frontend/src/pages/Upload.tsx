import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadApi, jobsApi } from '../services/api';
import { Card, Button, PageHeader, TableSkeleton } from '../components/ui';
import { JobInsights } from '../components/JobInsights';
import { toast } from '../components/Toast';
import { Upload as UploadIcon, FileSpreadsheet } from 'lucide-react';
import clsx from 'clsx';

function RecentJobInsights({ jobId }: { jobId: string | null }) {
  const { data: job } = useQuery({
    queryKey: ['jobs', 'detail', jobId],
    queryFn: () => jobsApi.get(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'COMPLETED' || s === 'FAILED' ? false : 2000;
    },
  });

  if (!jobId) return null;

  if (!job) {
    return (
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-ink-700 mb-3">Latest upload job</h2>
        <TableSkeleton rows={10} columns={4} />
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-ink-700 mb-3">Latest upload job</h2>
      {job.columnWarnings && job.columnWarnings.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
          <p className="font-semibold text-amber-800 mb-1">Column mapping warnings</p>
          <ul className="list-disc list-inside text-amber-700 space-y-0.5">
            {job.columnWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-600 mt-2">
            These columns were not found in the uploaded file. Reconciliation will treat their values as empty.
            Verify your export contains these columns or extend the alias list in the backend.
          </p>
        </div>
      )}
      <JobInsights job={job} />
    </div>
  );
}

export default function Upload() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'P2P' | 'ERP' | ''>('');
  const [runRecon, setRunRecon] = useState(true);
  const [replaceDataset, setReplaceDataset] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: () => uploadApi.upload(file!, source || undefined, runRecon, replaceDataset),
    onSuccess: (data) => {
      setLastJobId(data.jobId);
      toast.info('Upload started in background — you\'ll be notified when complete.');
      qc.invalidateQueries({ queryKey: ['jobs', 'list'] });
      qc.invalidateQueries({ queryKey: ['jobs', 'detail', data.jobId] });
    },
    onError: (err: unknown) => {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Upload failed to start';
      toast.error(msg);
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setFile(f);
  }, []);

  return (
    <div>
      <PageHeader eyebrow="Data Ingestion" title="Upload Vendor Files" />
      <div className="max-w-4xl">
        <Card className="mb-6">
          <div
            className={clsx(
              'flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl transition-colors cursor-pointer',
              dragOver ? 'border-accent-400 bg-accent-50' : 'border-ink-200 hover:border-ink-300',
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <UploadIcon className="w-10 h-10 text-ink-300 mb-3" />
            <p className="text-sm font-medium text-ink-600 mb-1">
              {file ? file.name : 'Drop your Excel file here, or click to browse'}
            </p>
            <p className="text-xs text-ink-400">
              Supports .xlsx up to 500MB — P2P VendorMasterReport or Oracle ERP export
            </p>
            <input id="file-input" type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </Card>

        {file && (
          <Card className="p-5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="w-8 h-8 text-accent-500" />
              <div>
                <p className="text-sm font-semibold text-ink-800">{file.name}</p>
                <p className="text-xs text-ink-400">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-ink-500 mb-1">Source (auto-detected if blank)</label>
                <select value={source} onChange={(e) => setSource(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white">
                  <option value="">Auto-detect</option>
                  <option value="P2P">P2P</option>
                  <option value="ERP">ERP (Oracle)</option>
                </select>
              </div>
              <div className="flex flex-col gap-2 justify-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={runRecon} onChange={(e) => setRunRecon(e.target.checked)} />
                  Run reconciliation after upload
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={replaceDataset} onChange={(e) => setReplaceDataset(e.target.checked)} />
                  Replace entire dataset
                </label>
              </div>
            </div>
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              {startMutation.isPending ? 'Starting…' : 'Start Upload & Process'}
            </Button>
          </Card>
        )}
      </div>
      <RecentJobInsights jobId={lastJobId} />
    </div>
  );
}
