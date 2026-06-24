import { redisClient as redis } from '../config/redis';
import { VideoCacheRepository } from '../repositories/VideoCacheRepository';

const repo = new VideoCacheRepository();

const L1_TTL_SECONDS = 60 * 60; // 1 hour in Redis by default
const NEGATIVE_CACHE_TTL_SECONDS = parseInt(process.env.NEGATIVE_CACHE_MINUTES || '15', 10) * 60;

export class CacheService {
  /**
   * Generates Redis key for L1 cache
   */
  private static getKey(videoId: string) {
    return `yt:cache:v1:${videoId}`;
  }

  /**
   * Generates Redis key for Negative cache
   */
  private static getNegativeKey(videoId: string) {
    return `yt:neg:${videoId}`;
  }

  /**
   * Gets cached data, checking L1 (Redis) first, then L2 (DB).
   */
  static async getCache(videoId: string) {
    // 1. Check L1 Cache
    const l1Data = await redis.get(this.getKey(videoId));
    if (l1Data) {
      console.log(`[CacheService] L1 Hit for ${videoId}`);
      return JSON.parse(l1Data);
    }

    // 2. Check Negative Cache
    const negData = await redis.get(this.getNegativeKey(videoId));
    if (negData) {
      console.log(`[CacheService] Negative Cache Hit for ${videoId}`);
      return { isNegative: true, error: negData };
    }

    // 3. Check L2 Cache
    const l2Data = await repo.findByVideoId(videoId);
    if (l2Data) {
      console.log(`[CacheService] L2 Hit for ${videoId}`);
      // Push back to L1
      const payload = {
        title: l2Data.title,
        thumbnail: l2Data.thumbnail,
        duration: l2Data.duration,
        uploader: l2Data.uploader,
        viewCount: l2Data.viewCount ? l2Data.viewCount.toString() : null,
        metadata: l2Data.metadata,
        formats: l2Data.formats,
        expiresAt: l2Data.expiresAt.getTime(),
        isStale: Date.now() > l2Data.expiresAt.getTime()
      };
      
      await redis.setex(this.getKey(videoId), L1_TTL_SECONDS, JSON.stringify(payload));
      return payload;
    }

    return null;
  }

  /**
   * Saves successful data to L1 and L2 caches.
   */
  static async saveCache(videoId: string, data: any) {
    const ttlHours = parseInt(process.env.CACHE_TTL_HOURS || '24', 10);
    
    // Save to L2 (Database)
    const dbRecord = await repo.upsertCache({
      videoId,
      title: data.title || null,
      thumbnail: data.thumbnail || null,
      duration: data.duration || null,
      uploader: data.uploader || null,
      viewCount: data.viewCount || null,
      metadata: data.metadata || {},
      formats: data.formats || [],
      expiresInHours: ttlHours
    });

    // Save to L1 (Redis)
    const payload = {
      title: dbRecord.title,
      thumbnail: dbRecord.thumbnail,
      duration: dbRecord.duration,
      uploader: dbRecord.uploader,
      viewCount: dbRecord.viewCount ? dbRecord.viewCount.toString() : null,
      metadata: dbRecord.metadata,
      formats: dbRecord.formats,
      expiresAt: dbRecord.expiresAt.getTime(),
      isStale: false
    };
    await redis.setex(this.getKey(videoId), L1_TTL_SECONDS, JSON.stringify(payload));
  }

  /**
   * Saves negative result to L1 cache only.
   */
  static async saveNegativeCache(videoId: string, errorMsg: string) {
    await redis.setex(this.getNegativeKey(videoId), NEGATIVE_CACHE_TTL_SECONDS, errorMsg);
  }

  /**
   * Pushes a stale version to Redis explicitly, useful during background refresh
   */
  static async pushStaleToL1(videoId: string, data: any) {
    const payload = { ...data, isStale: true };
    await redis.setex(this.getKey(videoId), 60 * 5, JSON.stringify(payload)); // Give it 5 mins while revalidating
  }
}

export const cacheRedisClient = redis;
