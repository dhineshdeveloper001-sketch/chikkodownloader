import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { DatabaseError } from '../errors/StructuredErrors';

const CACHE_VALID_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export class CacheRepository {
  /**
   * Retrieves a valid cache entry (fetched within the last 24 hours).
   */
  async getValidCache(videoId: string) {
    try {
      const cache = await prisma.videoCache.findUnique({
        where: { video_id: videoId },
      });

      if (!cache) return null;

      const isExpired = Date.now() - cache.last_fetched_at.getTime() > CACHE_VALID_DURATION_MS;
      if (isExpired) return null;

      return cache;
    } catch (error) {
      console.error('DatabaseError in getValidCache:', error);
      throw new DatabaseError('Failed to fetch valid cache');
    }
  }

  /**
   * Retrieves a cache entry regardless of age.
   */
  async getStaleCache(videoId: string) {
    try {
      return await prisma.videoCache.findUnique({
        where: { video_id: videoId },
      });
    } catch (error) {
      console.error('DatabaseError in getStaleCache:', error);
      throw new DatabaseError('Failed to fetch stale cache');
    }
  }

  /**
   * Upserts metadata for a video.
   */
  async upsertCache(videoId: string, url: string, metadata: any) {
    try {
      // Basic info extraction
      const title = metadata.title || null;
      const thumbnail = metadata.thumbnail || null;
      const duration = metadata.duration ? parseInt(metadata.duration, 10) : null;
      const uploader = metadata.uploader || null;
      const is_private = metadata.is_private === true || metadata.availability === 'private';
      const view_count = metadata.view_count ? BigInt(metadata.view_count) : null;

      return await prisma.videoCache.upsert({
        where: { video_id: videoId },
        update: {
          url,
          title,
          thumbnail,
          duration,
          uploader,
          metadata_json: metadata,
          is_private,
          view_count,
          last_fetched_at: new Date(),
          failure_count: 0,
          last_error: null,
          updated_at: new Date(),
        },
        create: {
          video_id: videoId,
          url,
          title,
          thumbnail,
          duration,
          uploader,
          metadata_json: metadata,
          is_private,
          view_count,
          last_fetched_at: new Date(),
        },
      });
    } catch (error) {
      console.error('DatabaseError in upsertCache:', error);
      throw new DatabaseError('Failed to upsert cache');
    }
  }

  /**
   * Marks a cache entry as failed.
   */
  async markFailure(videoId: string, url: string, errorMessage: string) {
    try {
      return await prisma.videoCache.upsert({
        where: { video_id: videoId },
        update: {
          failure_count: { increment: 1 },
          last_error: errorMessage,
          updated_at: new Date(),
        },
        create: {
          video_id: videoId,
          url,
          metadata_json: {},
          failure_count: 1,
          last_error: errorMessage,
        },
      });
    } catch (error) {
      console.error('DatabaseError in markFailure:', error);
      throw new DatabaseError('Failed to mark cache failure');
    }
  }

  /**
   * Get videos that haven't been fetched in the last 24h, prioritizing those with highest view_count (if known) and lowest failure_count.
   */
  async getVideosToRefresh(limit: number = 10) {
    try {
      const expirationDate = new Date(Date.now() - CACHE_VALID_DURATION_MS);
      return await prisma.videoCache.findMany({
        where: {
          last_fetched_at: { lt: expirationDate },
          failure_count: { lt: 5 }, // Ignore items failing repeatedly
        },
        orderBy: [
          { view_count: { sort: 'desc', nulls: 'last' } },
          { last_fetched_at: 'asc' },
        ],
        take: limit,
      });
    } catch (error) {
      console.error('DatabaseError in getVideosToRefresh:', error);
      throw new DatabaseError('Failed to get videos to refresh');
    }
  }
}
