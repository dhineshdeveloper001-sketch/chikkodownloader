import { VideoCacheRepository } from '../repositories/VideoCacheRepository';
import { DatabaseError } from '../errors/StructuredErrors';

const repo = new VideoCacheRepository();

export class CacheService {
  /**
   * Gets cached data from PostgreSQL.
   */
  static async getCache(videoId: string) {
    try {
      const l2Data = await repo.findByVideoId(videoId);
      if (l2Data) {
        // Handle Negative Cache
        if (l2Data.isNegative) {
          console.log(`[CacheService] Negative Cache Hit for ${videoId}`);
          return { isNegative: true, error: l2Data.metadata?.toString() || 'Video unavailable' };
        }

        console.log(`[CacheService] DB Hit for ${videoId}`);
        const payload = {
          title: l2Data.title,
          thumbnail: l2Data.thumbnail,
          duration: l2Data.duration,
          uploader: l2Data.uploader,
          viewCount: l2Data.viewCount ? l2Data.viewCount.toString() : null,
          metadata: l2Data.metadata,
          formats: l2Data.formats,
          expiresAt: l2Data.expiresAt.getTime(),
          isStale: Date.now() > l2Data.expiresAt.getTime(),
          url: (l2Data.metadata as any)?.url || `https://youtu.be/${videoId}`,
          filename: `${(l2Data.title || 'video').replace(/[^a-zA-Z0-9]/g, '_')}.mp4`,
          isYtDlp: true,
          contentType: 'video/mp4',
          size: null
        };
        
        return payload;
      }
      return null;
    } catch (err: any) {
      console.error('[CacheService] Error reading cache:', err);
      return null;
    }
  }

  /**
   * Saves successful data to PostgreSQL cache.
   */
  static async saveCache(videoId: string, data: any) {
    const ttlHours = parseInt(process.env.CACHE_TTL_HOURS || '24', 10);
    
    await repo.upsertCache({
      videoId,
      title: data.title || null,
      thumbnail: data.thumbnail || null,
      duration: data.duration || null,
      uploader: data.uploader || null,
      viewCount: data.viewCount || null,
      metadata: data.metadata || {},
      formats: data.formats || [],
      expiresInHours: ttlHours,
      isNegative: false
    });
  }

  /**
   * Saves negative result to PostgreSQL.
   */
  static async saveNegativeCache(videoId: string, errorMsg: string) {
    // Negative cache duration can be small, but here we'll use 1 hour or a separate setting
    const ttlHours = parseInt(process.env.NEGATIVE_CACHE_MINUTES || '15', 10) / 60;
    
    await repo.upsertCache({
      videoId,
      title: null,
      thumbnail: null,
      duration: null,
      uploader: null,
      viewCount: null,
      metadata: errorMsg,
      formats: [],
      expiresInHours: ttlHours,
      isNegative: true
    });
  }
}
