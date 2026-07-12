import { MediaExtractor } from './MediaExtractor';
import { YtDlpService } from '../YtDlpService';

export class VimeoExtractor implements MediaExtractor {
  extractId(url: string): string | null {
    // Matches e.g. https://vimeo.com/123456789
    const match = url.match(/vimeo\.com\/([0-9]+)/i);
    return match ? `vm_${match[1]}` : null;
  }

  async extractMetadata(url: string): Promise<any> {
    return YtDlpService.fetchMetadata(url);
  }
}
