import { Request, Response } from 'express';
import { PlatformDetector } from '../services/PlatformDetector';
import { CacheService } from '../services/CacheService';
import crypto from 'crypto';

export class MediaController {
  static async getMetadata(req: Request, res: Response) {
    try {
      console.log("\n=== Incoming Metadata Request ===");
      console.log("Method:", req.method);
      console.log("URL:", req.url);
      console.log("Query:", req.query);
      console.log("Body:", req.body);
      console.log("Headers:", { ...req.headers, cookie: '***MASKED***' });

      const { url, quality } = req.body;

      if (!url) {
        console.error("ERROR: Frontend did not send a valid URL parameter string.");
        return res.status(400).json({ success: false, error: 'URL field is absolutely required.' });
      }

      const targetResolution = quality || '1080';
      console.log(`[MediaController] URL validation passed. URL: ${url}`);

      // 1b. Detect Platform & Get Extractor
      console.log(`[MediaController] Starting platform detection and normalization...`);
      const extractor = PlatformDetector.getExtractor(url);
      console.log(`[MediaController] Extractor selected: ${extractor.constructor.name}`);
      
      let mediaId = extractor.extractId(url);
      if (!mediaId) {
        mediaId = crypto.createHash('md5').update(url).digest('hex');
      }

      // 2. Check PostgreSQL Cache
      const cachedData = await CacheService.getCache(mediaId);
      if (cachedData) {
        if ('isNegative' in cachedData && cachedData.isNegative) {
          return res.status(400).json({ success: false, error: (cachedData as any).error });
        }
        if ('isStale' in cachedData && !cachedData.isStale) {
          console.log(`[MediaController] Cache Hit for ${mediaId}`);
          console.log("=== SUCCESS: EXTRACTION DATA COMPLETE (CACHED) ===");
          return res.status(200).json({ ...cachedData, fromCache: true });
        }
      }

      // 3. Trigger our Extraction cluster loop / Fresh Data Fetch
      console.log(`[MediaController] Metadata extraction started for mediaId: ${mediaId}`);
      const freshData = await extractor.extractMetadata(url);
      console.log(`[MediaController] Metadata extraction succeeded.`);

      // Save to PostgreSQL Cache
      await CacheService.saveCache(mediaId, freshData);
      const result = await CacheService.getCache(mediaId);

      console.log("=== SUCCESS: EXTRACTION DATA COMPLETE ===");
      console.log(result);

      // Return exact valid payload object data envelope
      return res.status(200).json({ ...result, fromCache: false });

    } catch (error: any) {
      console.error("[MediaController] === CRITICAL BACKEND FAULT DETECTED ===");
      console.error(error.stack || error.message);
      
      const errMsg = error.message || 'Unknown internal execution crash.';

      if (errMsg === 'This platform is not currently supported.') {
        return res.status(400).json({ success: false, stage: 'metadata_validation', error: errMsg });
      }

      return res.status(500).json({ 
        success: false, 
        stage: 'metadata',
        error: errMsg,
        stack: error.stack
      });
    }
  }
}
