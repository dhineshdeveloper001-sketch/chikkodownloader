import { Queue, QueueEvents } from 'bullmq';
import { CacheService } from './CacheService';
import { VideoIdExtractor } from '../utils/VideoIdExtractor';
import { YTDLP_QUEUE_NAME } from '../workers/YtDlpWorker';
import { createRedisClient, redisClient } from '../config/redis';

// Dedicated connections for BullMQ
const queueConnection = createRedisClient();
const queueEventsConnection = createRedisClient();

// Initialize the BullMQ queue
export const ytDlpQueue = new Queue(YTDLP_QUEUE_NAME, {
  connection: queueConnection as any
});

const queueEvents = new QueueEvents(YTDLP_QUEUE_NAME, {
  connection: queueEventsConnection as any
});

export class MetadataOrchestrator {
  /**
   * Fetches metadata using Stale-While-Revalidate and Multi-Level Caching.
   */
  static async getMetadata(url: string) {
    const videoId = VideoIdExtractor.extract(url);
    if (!videoId) {
      throw new Error('Invalid URL or cannot extract Video ID');
    }

    // 1. Check Caches (L1 -> Negative -> L2)
    const cachedData = await CacheService.getCache(videoId);

    if (cachedData) {
      if (cachedData.isNegative) {
        throw new Error(cachedData.error);
      }

      if (!cachedData.isStale) {
        // Cache Hit & Valid -> Return immediately
        return { ...cachedData, fromCache: true };
      }

      // Cache Hit but Stale -> Stale-While-Revalidate
      console.log(`[Orchestrator] Stale cache for ${videoId}, triggering background refresh.`);
      await this.queueRefresh(videoId, url);
      
      // Temporarily push stale data to L1 to avoid slamming DB or Queue
      await CacheService.pushStaleToL1(videoId, cachedData);
      
      return { ...cachedData, fromCache: true, refreshQueued: true };
    }

    // 2. Cache Miss -> We must fetch now (wait for the result)
    console.log(`[Orchestrator] Cache miss for ${videoId}, queueing and waiting for fetch...`);
    
    // Check if there's already an active job for this video to prevent duplicate fetches
    const activeJobs = await ytDlpQueue.getActive();
    const isAlreadyFetching = activeJobs.some(job => job.data.videoId === videoId);

    const job = await ytDlpQueue.add('fetch', { videoId, url }, {
      jobId: `fetch-${videoId}-${Date.now()}`, // unique job id
      removeOnComplete: true,
      removeOnFail: true
    });

    try {
      // Wait for the job to complete (Max 35 seconds)
      const result = await job.waitUntilFinished(queueEvents, 35000);
      
      // If successful, data should be in cache now.
      const freshData = await CacheService.getCache(videoId);
      if (!freshData || freshData.isNegative) {
        throw new Error(freshData?.error || 'Failed to fetch metadata');
      }

      return { ...freshData, fromCache: false };
    } catch (error: any) {
      // Job failed or timed out
      throw new Error(`Failed to fetch metadata: ${error.message}`);
    }
  }

  /**
   * Queues a background refresh job without waiting.
   */
  private static async queueRefresh(videoId: string, url: string) {
    // Check if already in queue to avoid spam
    const delayedJobs = await ytDlpQueue.getDelayed();
    const waitingJobs = await ytDlpQueue.getWaiting();
    const activeJobs = await ytDlpQueue.getActive();
    
    const allPending = [...delayedJobs, ...waitingJobs, ...activeJobs];
    if (allPending.some(job => job.data.videoId === videoId)) {
      console.log(`[Orchestrator] Refresh for ${videoId} is already queued.`);
      return;
    }

    await ytDlpQueue.add('refresh', { videoId, url }, {
      jobId: `refresh-${videoId}-${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: true,
      priority: 2 // lower priority than initial cache-miss fetches
    });
  }

  /**
   * Health Check utility for Queue and Redis.
   */
  static async checkQueueHealth() {
    try {
      const ping = await redisClient.ping();
      if (ping !== 'PONG') throw new Error('Redis ping failed');

      // Check if queue is accessible
      await ytDlpQueue.getJobCounts();

      return true;
    } catch (error) {
      console.error('[MetadataOrchestrator] Health Check Failed:', error);
      return false;
    }
  }

  /**
   * Graceful Shutdown for Queues
   */
  static async close() {
    console.log('[MetadataOrchestrator] Closing BullMQ connections...');
    await ytDlpQueue.close();
    await queueEvents.close();
    queueConnection.disconnect();
    queueEventsConnection.disconnect();
  }
}
