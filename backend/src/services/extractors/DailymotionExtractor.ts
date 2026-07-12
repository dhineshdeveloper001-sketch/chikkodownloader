import { MediaExtractor } from './MediaExtractor';
import { YtDlpService } from '../YtDlpService';

export class DailymotionExtractor implements MediaExtractor {
  extractId(url: string): string | null {
    // Matches e.g. https://www.dailymotion.com/video/x8j1234
    const match = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/i);
    return match ? `dm_${match[1]}` : null;
  }

  async extractMetadata(url: string): Promise<any> {
    return YtDlpService.fetchMetadata(url);
  }
}
