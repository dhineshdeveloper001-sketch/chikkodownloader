import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { DatabaseError } from '../errors/StructuredErrors';

export class VideoCacheRepository {
  /**
   * Retrieves a cache entry by videoId.
   */
  async findByVideoId(videoId: string) {
    try {
      return await prisma.videoCache.findUnique({
        where: { videoId },
      });
    } catch (error) {
      console.error('DatabaseError in findByVideoId:', error);
      throw new DatabaseError('Failed to fetch cache from DB');
    }
  }

  /**
   * Upserts metadata and formats for a video.
   */
  async upsertCache(data: {
    videoId: string;
    title: string | null;
    thumbnail: string | null;
    duration: number | null;
    uploader: string | null;
    viewCount: bigint | null;
    metadata: any;
    formats: any;
    isNegative?: boolean;
    expiresInHours: number;
  }) {
    try {
      const expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);

      return await prisma.videoCache.upsert({
        where: { videoId: data.videoId },
        update: {
          title: data.title,
          thumbnail: data.thumbnail,
          duration: data.duration,
          uploader: data.uploader,
          viewCount: data.viewCount,
          metadata: data.metadata,
          formats: data.formats,
          isNegative: data.isNegative || false,
          expiresAt,
          updatedAt: new Date(),
        },
        create: {
          videoId: data.videoId,
          title: data.title,
          thumbnail: data.thumbnail,
          duration: data.duration,
          uploader: data.uploader,
          viewCount: data.viewCount,
          metadata: data.metadata,
          formats: data.formats,
          isNegative: data.isNegative || false,
          expiresAt,
        },
      });
    } catch (error) {
      console.error('DatabaseError in upsertCache:', error);
      throw new DatabaseError('Failed to upsert cache to DB');
    }
  }
}
