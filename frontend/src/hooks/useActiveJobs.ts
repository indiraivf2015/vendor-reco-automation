import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { jobsApi, JobState } from '../services/api';

const ACTIVE_STATUSES = new Set<JobState['status']>(['QUEUED', 'PARSING', 'INGESTING']);

/**
 * Polls job list and surfaces running jobs plus jobs that just completed (for toasts / refresh).
 */
export function useActiveJobs() {
  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs', 'list'],
    queryFn: jobsApi.list,
    refetchInterval: 2000,
  });

  const activeJobs = useMemo(
    () => jobs.filter((j) => ACTIVE_STATUSES.has(j.status)),
    [jobs],
  );

  const prevStatusRef = useRef<Record<string, JobState['status']>>({});
  const [recentlyCompleted, setRecentlyCompleted] = useState<JobState[]>([]);

  useEffect(() => {
    const burst: JobState[] = [];
    for (const j of jobs) {
      const prev = prevStatusRef.current[j.id];
      if (prev && ACTIVE_STATUSES.has(prev) && j.status === 'COMPLETED') {
        burst.push(j);
      }
      prevStatusRef.current[j.id] = j.status;
    }
    setRecentlyCompleted(burst);
  }, [jobs]);

  return { activeJobs, recentlyCompleted, jobs };
}
