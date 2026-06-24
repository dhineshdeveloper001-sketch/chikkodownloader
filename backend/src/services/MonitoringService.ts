export class MonitoringService {
  private static metrics = {
    total_requests: 0,
    successful_requests: 0,
    failed_requests: 0,
    cache_hits: 0,
    cache_misses: 0,
    stale_cache_returns: 0,
    yt_dlp_success: 0,
    yt_dlp_failures: 0,
    total_response_time_ms: 0,
    active_requests: 0,
    started_at: Date.now()
  };

  static recordRequestStart() {
    this.metrics.total_requests++;
    this.metrics.active_requests++;
    return Date.now();
  }

  static recordRequestEnd(startTime: number, isSuccess: boolean) {
    this.metrics.active_requests = Math.max(0, this.metrics.active_requests - 1);
    this.metrics.total_response_time_ms += (Date.now() - startTime);
    if (isSuccess) {
      this.metrics.successful_requests++;
    } else {
      this.metrics.failed_requests++;
    }
  }

  static recordCacheHit() {
    this.metrics.cache_hits++;
  }

  static recordCacheMiss() {
    this.metrics.cache_misses++;
  }

  static recordStaleCacheReturn() {
    this.metrics.stale_cache_returns++;
  }

  static recordYtDlpSuccess() {
    this.metrics.yt_dlp_success++;
  }

  static recordYtDlpFailure() {
    this.metrics.yt_dlp_failures++;
  }

  static getMetrics() {
    const totalFinished = this.metrics.successful_requests + this.metrics.failed_requests;
    const avgResponseTime = totalFinished > 0 ? this.metrics.total_response_time_ms / totalFinished : 0;
    const successRate = this.metrics.total_requests > 0 ? (this.metrics.successful_requests / this.metrics.total_requests) * 100 : 100;
    
    return {
      totalRequests: this.metrics.total_requests,
      activeRequests: this.metrics.active_requests,
      cacheHits: this.metrics.cache_hits,
      cacheMisses: this.metrics.cache_misses,
      staleCacheReturns: this.metrics.stale_cache_returns,
      ytDlpFailures: this.metrics.yt_dlp_failures,
      ytDlpSuccesses: this.metrics.yt_dlp_success,
      successRate: parseFloat(successRate.toFixed(2)),
      avgResponseTimeMs: parseFloat(avgResponseTime.toFixed(2))
    };
  }

  static getHealth() {
    return {
      status: 'healthy',
      cache: 'active',
      uptimeSeconds: Math.floor((Date.now() - this.metrics.started_at) / 1000)
    };
  }
}
