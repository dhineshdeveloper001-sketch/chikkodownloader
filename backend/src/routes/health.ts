import { Router } from 'express';
import { MonitoringService } from '../services/MonitoringService';

const router = Router();

router.get('/status', (req, res) => {
  res.json(MonitoringService.getHealth());
});

router.get('/metrics', (req, res) => {
  res.json(MonitoringService.getMetrics());
});

router.get('/cache-stats', (req, res) => {
  const metrics = MonitoringService.getMetrics();
  res.json({
    totalCachedVideos: metrics.cacheHits + metrics.cacheMisses, // Approximation for memory
    expiredVideos: metrics.staleCacheReturns,
    cacheHitRatio: metrics.cacheHits + metrics.cacheMisses > 0 
      ? parseFloat(((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(2))
      : 0
  });
});

export default router;
