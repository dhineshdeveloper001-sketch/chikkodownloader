import { Worker, Job } from 'bullmq';
import { CacheService } from '../services/CacheService';
import { YtDlpService } from '../services/YtDlpService';
import { createRedisClient } from '../config/redis';

export const YTDLP_QUEUE_NAME = 'metadata-fetch';

export let ytDlpWorker: Worker | null = null;
let workerRedisConnection: any = null;

export const startWorker = () => {
  if (ytDlpWorker) return;

  workerRedisConnection = createRedisClient();

  ytDlpWorker = new Worker(
    YTDLP_QUEUE_NAME,
    async (job: Job) => {
      const { videoId, url } = job.data;
      console.log(`[YtDlpWorker] Processing job for ${videoId}`);

      try {
        const freshData = await YtDlpService.fetchMetadata(url);
        await CacheService.saveCache(videoId, freshData);
        console.log(`[YtDlpWorker] Successfully refreshed cache for ${videoId}`);

        return { success: true, videoId };
      } catch (error: any) {
        console.error(`[YtDlpWorker] Job failed for ${videoId}:`, error.message);
        if (error.isNegative) {
          await CacheService.saveNegativeCache(videoId, error.message);
        }
        throw error;
      }
    },
    {
      connection: workerRedisConnection as any,
      concurrency: 2,
    }
  );

  ytDlpWorker.on('completed', (job) => {
    console.log(`[YtDlpWorker] Job ${job.id} completed successfully`);
  });

  ytDlpWorker.on('failed', (job, err) => {
    console.log(`[YtDlpWorker] Job ${job?.id} failed with ${err.message}`);
  });

  return ytDlpWorker;
};

export const closeWorker = async () => {
  if (ytDlpWorker) {
    console.log('[YtDlpWorker] Closing BullMQ Worker...');
    await ytDlpWorker.close();
    workerRedisConnection?.disconnect();
    ytDlpWorker = null;
  }
};
