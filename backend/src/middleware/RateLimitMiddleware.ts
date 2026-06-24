import rateLimit from 'express-rate-limit';

export const RateLimitMiddleware = {
  metadataLimiter: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: parseInt(process.env.RATE_LIMIT_METADATA || '20', 10),
    message: { success: false, error: 'Too many metadata requests from this IP, please try again after an hour' },
    standardHeaders: true,
    legacyHeaders: false,
  }),
  downloadLimiter: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: parseInt(process.env.RATE_LIMIT_DOWNLOAD || '10', 10),
    message: { success: false, error: 'Too many download requests from this IP, please try again after an hour' },
    standardHeaders: true,
    legacyHeaders: false,
  })
};
