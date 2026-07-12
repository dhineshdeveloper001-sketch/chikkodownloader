import { MediaExtractor } from './MediaExtractor';
import { YtDlpService } from '../YtDlpService';

export class TikTokExtractor implements MediaExtractor {
  extractId(url: string): string | null {
    // Matches e.g. https://www.tiktok.com/@user/video/1234567890
    const match = url.match(/tiktok\.com\/@[^\/]+\/video\/([0-9]+)/i);
    if (match) return `tt_${match[1]}`;
    
    // For vm.tiktok.com short URLs
    const shortMatch = url.match(/vm\.tiktok\.com\/([^\/?#&]+)/i);
    if (shortMatch) return `tt_vm_${shortMatch[1]}`;

    return null;
  }

  async extractMetadata(url: string): Promise<any> {
    return YtDlpService.fetchMetadata(url);
  }
}
