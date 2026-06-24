import { Router } from 'express';
import { ytDlpQueue } from '../services/MetadataOrchestrator';
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

router.get('/queue/status', async (req, res) => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      ytDlpQueue.getWaitingCount(),
      ytDlpQueue.getActiveCount(),
      ytDlpQueue.getCompletedCount(),
      ytDlpQueue.getFailedCount(),
      ytDlpQueue.getDelayedCount()
    ]);
    res.json({ waiting, active, completed, failed, delayed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/queue/jobs', async (req, res) => {
  try {
    const jobs = await ytDlpQueue.getJobs(['active', 'waiting', 'delayed', 'failed']);
    res.json(jobs.map(j => ({ id: j.id, name: j.name, data: j.data, status: j.failedReason ? 'failed' : 'pending' })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
