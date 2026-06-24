import { MetadataService } from '../services/MetadataService';
import { MonitoringService } from '../services/MonitoringService';
import { CacheRepository } from '../repositories/CacheRepository';

const cacheRepo = new CacheRepository();

type JobState = 'pending' | 'running' | 'completed' | 'failed';

interface RefreshJob {
  videoId: string;
  url: string;
  state: JobState;
  retryCount: number;
  addedAt: number;
  runAt: number;
}

export class BackgroundRefreshWorker {
  private static jobs = new Map<string, RefreshJob>();
  private static isProcessing = false;
  private static MAX_RETRIES = 3;
  private static RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000]; // 1m, 5m, 15m
  private static timerInterval: NodeJS.Timeout | null = null;

  static start() {
    if (this.timerInterval) return;
    console.log('[BackgroundRefreshWorker] Starting background refresh polling...');
    // Poll every 10 minutes for videos to refresh
    this.timerInterval = setInterval(() => this.pollDatabase(), 10 * 60 * 1000);
    // Initial poll
    setTimeout(() => this.pollDatabase(), 5000);
  }

  private static async pollDatabase() {
    try {
      console.log('[BackgroundRefreshWorker] Polling database for stale popular videos...');
      const videos = await cacheRepo.getVideosToRefresh(5); // Refresh top 5 at a time
      for (const v of videos) {
        this.queueRefresh(v.video_id, v.url);
      }
    } catch (err) {
      console.error('[BackgroundRefreshWorker] Failed to poll database:', err);
    }
  }

  static queueRefresh(videoId: string, url: string) {
    if (this.jobs.has(videoId)) {
      const existingJob = this.jobs.get(videoId)!;
      // Do not queue again if it's already pending or running
      if (existingJob.state === 'pending' || existingJob.state === 'running') {
        return;
      }
    }

    this.jobs.set(videoId, {
      videoId,
      url,
      state: 'pending',
      retryCount: 0,
      addedAt: Date.now(),
      runAt: Date.now()
    });

    this.startProcessing();
  }

  private static async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        const job = this.getNextJob();
        if (!job) break;

        await this.processJob(job);
        this.cleanupOldJobs();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private static getNextJob(): RefreshJob | null {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (job.state === 'pending' && now >= job.runAt) {
        return job;
      }
    }
    return null;
  }

  private static async processJob(job: RefreshJob) {
    job.state = 'running';
    try {
      // Force a fresh fetch by bypassing cache age check
      console.log(`[Worker] Starting background refresh for ${job.videoId}`);
      await MetadataService.forceRefresh(job.url, job.videoId);
      
      job.state = 'completed';
      MonitoringService.recordYtDlpSuccess();
      console.log(`[Worker] Completed background refresh for ${job.videoId}`);
    } catch (err: any) {
      MonitoringService.recordYtDlpFailure();
      job.retryCount++;
      if (job.retryCount <= this.MAX_RETRIES) {
        job.state = 'pending';
        job.runAt = Date.now() + this.RETRY_DELAYS_MS[job.retryCount - 1];
        console.warn(`[Worker] Refresh failed for ${job.videoId}. Retrying in ${this.RETRY_DELAYS_MS[job.retryCount - 1] / 1000}s. Error: ${err.message}`);
      } else {
        job.state = 'failed';
        console.error(`[Worker] Refresh permanently failed for ${job.videoId} after ${this.MAX_RETRIES} retries.`);
      }
    }
  }

  private static cleanupOldJobs() {
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    
    for (const [id, job] of this.jobs.entries()) {
      if (job.state === 'completed' || (job.state === 'failed' && now - job.addedAt > ONE_DAY_MS)) {
        this.jobs.delete(id);
      }
    }
  }

  static getStatus() {
    let pending = 0, running = 0, failed = 0, completed = 0;
    for (const job of this.jobs.values()) {
      if (job.state === 'pending') pending++;
      else if (job.state === 'running') running++;
      else if (job.state === 'failed') failed++;
      else if (job.state === 'completed') completed++;
    }
    return { pending, running, failed, completed, totalTracked: this.jobs.size };
  }

  static getJobs() {
    return Array.from(this.jobs.values());
  }
}
