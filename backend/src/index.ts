import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import mediaRoutes from './routes/media';
import statsRoutes from './routes/stats';
import adminRoutes from './routes/admin';
import path from 'path';

dotenv.config();

// Startup Validation
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'secret') {
  console.error('CRITICAL: JWT_SECRET is not set properly in .env!');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

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

app.get('/media/:filename', (req, res) => {
  res.status(403).json({ error: 'Direct file access is forbidden. Please use the secure download proxy.' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
