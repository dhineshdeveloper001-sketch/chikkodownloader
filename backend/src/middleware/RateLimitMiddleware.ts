import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// Create a single Redis connection for rate limiters
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('error', (err) => {
  console.error('[Redis Rate Limiter] Error:', err);
});

const metadataLimit = parseInt(process.env.RATE_LIMIT_METADATA || '20', 10);
const downloadLimit = parseInt(process.env.RATE_LIMIT_DOWNLOAD || '10', 10);

export const RateLimitMiddleware = {
  metadataLimiter: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: metadataLimit,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error - Known typing issue with rate-limit-redis and ioredis v5
      sendCommand: (...args: string[]) => redisClient.call(...args),
    }),
    message: { error: `Too many metadata requests. Maximum allowed is ${metadataLimit} per hour.` }
  }),

  downloadLimiter: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: downloadLimit,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error
      sendCommand: (...args: string[]) => redisClient.call(...args),
    }),
    message: { error: `Too many download requests. Maximum allowed is ${downloadLimit} per hour.` }
  })
};
