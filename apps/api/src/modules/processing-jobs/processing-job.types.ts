export const ANALYSIS_JOB_TYPE = "analyze";

export type ProcessingJob = {
  id: string;
  libraryItemId: string;
  providerId: string;
  jobType: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};
