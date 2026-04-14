import fs from 'fs'
import path from 'path'
import os from 'os'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export interface Job {
  jobId: string
  status: JobStatus
  progress: number
  inputPath: string
  outputPath: string | null
  error: string | null
  createdAt: number
}

const jobs = new Map<string, Job>()
const BASE_DIR = path.join(os.tmpdir(), 'drawing-viewer')

export function ensureBaseDir(): void {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true })
}

export function createJob(jobId: string, inputPath: string): Job {
  const job: Job = {
    jobId,
    status: 'queued',
    progress: 0,
    inputPath,
    outputPath: null,
    error: null,
    createdAt: Date.now(),
  }
  jobs.set(jobId, job)
  return job
}

export function updateJob(jobId: string, update: Partial<Job>): void {
  const job = jobs.get(jobId)
  if (job) Object.assign(job, update)
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId)
}

export function getJobDir(jobId: string): string {
  return path.join(BASE_DIR, jobId)
}

/** Purge jobs and temp files older than ttlMs (default 1 hour) */
export function cleanupOldJobs(ttlMs = 3_600_000): void {
  const cutoff = Date.now() - ttlMs
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) {
      const dir = getJobDir(id)
      fs.rm(dir, { recursive: true, force: true }, () => {})
      jobs.delete(id)
    }
  }
}

// Schedule cleanup every 15 minutes
setInterval(() => cleanupOldJobs(), 15 * 60 * 1_000)
