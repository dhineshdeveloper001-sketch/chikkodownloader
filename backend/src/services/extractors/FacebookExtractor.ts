import { MediaExtractor } from './MediaExtractor';
import { YtDlpService } from '../YtDlpService';

export class FacebookExtractor implements MediaExtractor {
  extractId(url: string): string | null {
    // Matches FB video ids
    const match = url.match(/(?:facebook\.com|fb\.watch).*(?:\/videos\/|\/v\/|v=)([a-zA-Z0-9]+)/i);
    if (match) return `fb_${match[1]}`;
    
    // For fb.watch short URLs, we might not get an ID easily without following redirects.
    // For caching, we can just hash the url if no clear ID is found.
    const fbWatchMatch = url.match(/fb\.watch\/([^\/?#&]+)/i);
    if (fbWatchMatch) return `fbw_${fbWatchMatch[1]}`;

    return null;
  }

  async extractMetadata(url: string): Promise<any> {
    return YtDlpService.fetchMetadata(url);
  }
}
