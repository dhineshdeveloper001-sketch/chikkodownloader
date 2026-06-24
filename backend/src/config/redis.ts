import Redis from 'ioredis';

/**
 * Creates a new Redis instance configured specifically for BullMQ compatibility.
 * BullMQ requires `maxRetriesPerRequest: null`.
 */
export const createRedisClient = () => {
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true
  });
};

/**
 * A singleton Redis instance for general-purpose use (Caching, Rate Limiting).
 * Reuses the same configuration to ensure consistency.
 */
export const redisClient = createRedisClient();
