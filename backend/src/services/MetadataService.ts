import { CacheService } from './CacheService';
import { YtDlpService } from './YtDlpService';
import { VideoIdExtractor } from '../utils/VideoIdExtractor';

export class MetadataService {
  /**
   * Fetches metadata for a YouTube URL using PostgreSQL Cache and yt-dlp fallback.
   */
  static async getMetadata(url: string) {
    const videoId = VideoIdExtractor.extract(url);
    if (!videoId) {
      throw new Error('Invalid URL or cannot extract Video ID');
    }

    // 1. Check PostgreSQL Cache
    const cachedData = await CacheService.getCache(videoId);

    if (cachedData) {
      if ('isNegative' in cachedData && cachedData.isNegative) {
        throw new Error((cachedData as any).error);
      }

      if ('isStale' in cachedData && !cachedData.isStale) {
        // Cache Hit & Valid -> Return immediately
        console.log(`[MetadataService] Cache Hit for ${videoId}`);
        return { ...cachedData, fromCache: true };
      }
      
      console.log(`[MetadataService] Cache for ${videoId} is stale, fetching fresh data...`);
    } else {
      console.log(`[MetadataService] Cache Miss for ${videoId}, fetching fresh data...`);
    }

    // 2. Fetch fresh data (Synchronous fallback)
    try {
      const freshData = await YtDlpService.fetchMetadata(url);

      // 3. Save to PostgreSQL Cache
      await CacheService.saveCache(videoId, freshData);
      console.log(`[MetadataService] Successfully fetched and cached ${videoId}`);

      const result = await CacheService.getCache(videoId);
      return { ...result, fromCache: false };

    } catch (error: any) {
      console.error(`[MetadataService] Fetch failed for ${videoId}:`, error.message);
      
      // If it's a known restricted video (private/geo), cache the negative result temporarily
      if (error.isNegative) {
        await CacheService.saveNegativeCache(videoId, error.message);
      }
      
      throw new Error(`Failed to fetch metadata: ${error.message}`);
    }
  }
}
