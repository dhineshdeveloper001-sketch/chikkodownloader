import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import crypto from 'crypto';
import authRoutes from './routes/auth';
import mediaRoutes from './routes/media';
import statsRoutes from './routes/stats';
import adminRoutes from './routes/admin';
import healthRoutes from './routes/health';
import path from 'path';
import prisma from './prisma';
import { ytDlpCmd } from './services/YtDlpService';
import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

dotenv.config();

// Startup Validation
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'secret') {
  console.error('CRITICAL: JWT_SECRET is not set properly in .env!');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('CRITICAL: DATABASE_URL is not set in .env!');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Render proxy support for express-rate-limit

const PORT = process.env.PORT || 10000;

// Security Middleware
app.disable('x-powered-by');

// Helmet Configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || "http://localhost:5173", "http://localhost:5174"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(compression());
app.use(cookieParser(process.env.JWT_SECRET));
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));

// CSRF Protection (Custom Double Submit Cookie)
const csrfProtection = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ignoredMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (ignoredMethods.includes(req.method)) return next();

  const csrfCookie = req.cookies['x-csrf-token'];
  const csrfHeader = req.headers['x-csrf-token'];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
  }
  next();
};

app.use(csrfProtection);

app.get('/api/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('x-csrf-token', token, {
    httpOnly: false, // Must be readable by frontend to send in header
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  res.json({ token });
});

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(globalLimiter);

// Global Request Logger
app.use((req, res, next) => {
  console.log(`\n[INCOMING REQUEST] ${req.method} ${req.url}`);
  console.log(`[REQUEST BODY]`, req.body);
  console.log(`[REQUEST QUERY]`, req.query);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health', healthRoutes);

app.get('/api/health', async (req, res) => {
  try {
    // Check DB
    await prisma.$queryRaw`SELECT 1`;
    // Check yt-dlp
    const { stdout: ytdlpVersion } = await execFileAsync(ytDlpCmd, ['--version']);
    
    // Check ffmpeg (Fallback strictly to OS ffmpeg)
    const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : (require('ffmpeg-static') || 'ffmpeg');
    const { stdout: ffmpegOut, stderr: ffmpegErr } = await execFileAsync(ffmpegPath, ['-version']);
    const ffmpegVersion = ffmpegOut.split('\n')[0] || ffmpegErr.split('\n')[0];

    // Check temp writability
    const tempTestFile = path.join(process.cwd(), '.temp_write_test');
    let tempWritable = false;
    try {
      fs.writeFileSync(tempTestFile, 'ok');
      if (fs.existsSync(tempTestFile)) {
        fs.unlinkSync(tempTestFile);
        tempWritable = true;
      }
    } catch(e) {}
    
    res.json({
      status: 'ok',
      database: 'connected',
      ytdlp: ytdlpVersion.trim(),
      ffmpeg: ffmpegVersion.trim(),
      node: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      tempWritable
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      stage: 'health_check',
      message: 'Health check failed',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/media/:filename', (req, res) => {
  res.status(403).json({ error: 'Direct file access is forbidden. Please use the secure download proxy.' });
});

// Serve frontend static files from the 'public' directory we copied in Docker
app.use(express.static(path.join(process.cwd(), 'public')));

// Catch-all route to serve React app for client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  } else {
    next();
  }
});

// Global Error Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

async function startServer() {
  console.log('Running Startup Validations...');
  try {
    // 1. Prisma Check
    await prisma.$queryRaw`SELECT 1`;
    console.log('[BOOT] Prisma Connected');

    // 2. yt-dlp Check
    const { stdout } = await execFileAsync(ytDlpCmd, ['--version']);
    console.log(`[BOOT] yt-dlp Available (v${stdout.trim()})`);

  } catch (error: any) {
    console.error('[BOOT] FATAL ERROR during initialization:', error.message);
    process.exit(1);
  }

  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[BOOT] Server Listening on port ${PORT} at 0.0.0.0`);
  });

  // Graceful Shutdown Handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n[Shutdown] Received ${signal}, starting graceful shutdown...`);
    
    server.close(() => {
      console.log('[Shutdown] Express server closed.');
    });

    try {
      await prisma.$disconnect();
      console.log('[Shutdown] All connections closed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('[Shutdown] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();
