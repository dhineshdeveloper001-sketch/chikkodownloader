import { MediaExtractor } from './MediaExtractor';
import { YtDlpService } from '../YtDlpService';

export class XExtractor implements MediaExtractor {
  extractId(url: string): string | null {
    // Matches e.g. https://twitter.com/user/status/1234567890
    // or https://x.com/user/status/1234567890
    const match = url.match(/(?:twitter\.com|x\.com)\/[^\/]+\/status\/([0-9]+)/i);
    return match ? `x_${match[1]}` : null;
  }

  async extractMetadata(url: string): Promise<any> {
    return YtDlpService.fetchMetadata(url);
  }
}
