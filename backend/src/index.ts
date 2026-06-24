import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import mediaRoutes from './routes/media';
import statsRoutes from './routes/stats';
import adminRoutes from './routes/admin';
import healthRoutes from './routes/health';
import path from 'path';
import { startWorker, closeWorker } from './workers/YtDlpWorker';
import prisma from './prisma';
import { redisClient } from './config/redis';
import { MetadataOrchestrator } from './services/MetadataOrchestrator';
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

const PORT = process.env.PORT || 5000;

// Security Middleware
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(globalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health', healthRoutes);

app.get('/health', async (req, res) => {
  try {
    // Check DB
    await prisma.$queryRaw`SELECT 1`;
    // Check Redis
    const ping = await redisClient.ping();
    if (ping !== 'PONG') throw new Error('Redis ping failed');
    // Check yt-dlp
    await execFileAsync(ytDlpCmd, ['--version']);
    
    // Check Queue
    const queueHealth = await MetadataOrchestrator.checkQueueHealth();
    if (!queueHealth) throw new Error('Queue health check failed');

    res.json({
      success: true,
      database: 'connected',
      redis: 'connected',
      ytdlp: 'available',
      queue: 'ready'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/media/:filename', (req, res) => {
  res.status(403).json({ error: 'Direct file access is forbidden. Please use the secure download proxy.' });
});

// Serve frontend static files
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// Catch-all route to serve React app for client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
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

    // 2. Redis Check
    const ping = await redisClient.ping();
    if (ping !== 'PONG') throw new Error('Redis ping failed');
    console.log('[BOOT] Redis Connected');

    // 3. Queue Check
    const queueHealth = await MetadataOrchestrator.checkQueueHealth();
    if (!queueHealth) throw new Error('BullMQ Queue Health Check Failed');
    console.log('[BOOT] BullMQ Queue Ready');

    // 4. Worker Start
    startWorker();
    console.log('[BOOT] BullMQ Worker Started');

    // 5. yt-dlp Check
    const { stdout } = await execFileAsync(ytDlpCmd, ['--version']);
    console.log(`[BOOT] yt-dlp Available (v${stdout.trim()})`);

  } catch (error: any) {
    console.error('[BOOT] FATAL ERROR during initialization:', error.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`[BOOT] Server Listening on port ${PORT}`);
  });

  // Graceful Shutdown Handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n[Shutdown] Received ${signal}, starting graceful shutdown...`);
    
    server.close(() => {
      console.log('[Shutdown] Express server closed.');
    });

    try {
      await closeWorker();
      await MetadataOrchestrator.close();
      await redisClient.quit();
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
