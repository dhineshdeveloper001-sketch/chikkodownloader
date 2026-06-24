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
import { BackgroundRefreshWorker } from './workers/BackgroundRefreshWorker';

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  BackgroundRefreshWorker.start();
});
