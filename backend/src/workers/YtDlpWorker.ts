import { Worker, Job } from 'bullmq';
import { cacheRedisClient, CacheService } from '../services/CacheService';
import { YtDlpService } from '../services/YtDlpService';

export const YTDLP_QUEUE_NAME = 'metadata-fetch';

export const ytDlpWorker = new Worker(
  YTDLP_QUEUE_NAME,
  async (job: Job) => {
    const { videoId, url } = job.data;
    console.log(`[YtDlpWorker] Processing job for ${videoId}`);

    try {
      // 1. Fetch metadata via YtDlpService
      const freshData = await YtDlpService.fetchMetadata(url);

      // 2. Save to Cache
      await CacheService.saveCache(videoId, freshData);
      console.log(`[YtDlpWorker] Successfully refreshed cache for ${videoId}`);

      return { success: true, videoId };
    } catch (error: any) {
      console.error(`[YtDlpWorker] Job failed for ${videoId}:`, error.message);
      
      // If it's a negative cache error (private/geo blocked)
      if (error.isNegative) {
        await CacheService.saveNegativeCache(videoId, error.message);
      }
      
      throw error; // Let BullMQ handle retries if configured
    }
  },
  {
    connection: cacheRedisClient as any,
    concurrency: 2, // Limit yt-dlp concurrency to prevent Render CPU crashes
  }
);

ytDlpWorker.on('completed', (job) => {
  console.log(`[YtDlpWorker] Job ${job.id} completed successfully`);
});

ytDlpWorker.on('failed', (job, err) => {
  console.log(`[YtDlpWorker] Job ${job?.id} failed with ${err.message}`);
});
