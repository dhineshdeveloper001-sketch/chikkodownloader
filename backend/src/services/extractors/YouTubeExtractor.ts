import { MediaExtractor } from './MediaExtractor';
import { YtDlpService } from '../YtDlpService';

export class YouTubeExtractor implements MediaExtractor {
  extractId(url: string): string | null {
    // Matches standard YT, youtu.be, embed, and shorts URLs
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (match) return `yt_${match[1]}`;
    return null;
  }

  async extractMetadata(url: string): Promise<any> {
    return YtDlpService.fetchMetadata(url);
  }
}
