import { Request, Response } from 'express';
import { PlatformDetector } from '../services/PlatformDetector';
import { CacheService } from '../services/CacheService';
import crypto from 'crypto';

export class MediaController {
  static async getMetadata(req: Request, res: Response) {
    try {
      // 1. Debugging check: View what the frontend is sending to the console terminal
      console.log("=== CHIKKO BACKEND: RECEIVED METADATA REQUEST ===");
      console.log("Request Body Payload:", req.body);

      const { url, quality } = req.body;

      if (!url) {
        console.error("ERROR: Frontend did not send a valid URL parameter string.");
        return res.status(400).json({ success: false, error: 'URL field is absolutely required.' });
      }

      const targetResolution = quality || '1080';
      console.log(`Extracting link: ${url} at resolution: ${targetResolution}`);

      // 1b. Detect Platform & Get Extractor
      const extractor = PlatformDetector.getExtractor(url);
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
      const freshData = await extractor.extractMetadata(url);

      // Save to PostgreSQL Cache
      await CacheService.saveCache(mediaId, freshData);
      const result = await CacheService.getCache(mediaId);

      console.log("=== SUCCESS: EXTRACTION DATA COMPLETE ===");
      console.log(result);

      // Return exact valid payload object data envelope
      return res.status(200).json({ ...result, fromCache: false });

    } catch (error: any) {
      // 4. THIS CAPTURES THE SILENT KILLER: Print out full detailed crash data to backend terminal
      console.error("=== CRITICAL BACKEND FAULT DETECTED ===");
      console.error("Error Stack Trace:", error);
      console.error("=========================================");

      const errMsg = error.message || 'Unknown internal execution crash.';

      if (errMsg === 'This platform is not currently supported.') {
        return res.status(400).json({ success: false, error: errMsg });
      }

      // Prevents generic 500 crash in browser, bubbles exact error message text inside JSON instead!
      return res.status(500).json({ 
        success: false, 
        error: 'Backend system failed to extract asset metadata stream.',
        reason: errMsg 
      });
    }
  }
}
