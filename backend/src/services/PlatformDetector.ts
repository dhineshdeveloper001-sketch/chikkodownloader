import { MediaExtractor } from './extractors/MediaExtractor';
import { InstagramExtractor } from './extractors/InstagramExtractor';
import { FacebookExtractor } from './extractors/FacebookExtractor';
import { TikTokExtractor } from './extractors/TikTokExtractor';
import { VimeoExtractor } from './extractors/VimeoExtractor';
import { DailymotionExtractor } from './extractors/DailymotionExtractor';
import { XExtractor } from './extractors/XExtractor';
import { YouTubeExtractor } from './extractors/YouTubeExtractor';

export class PlatformDetector {
  static getExtractor(url: string): MediaExtractor {
    const cleanUrl = url.toLowerCase();

    if (cleanUrl.includes('youtube.com/') || cleanUrl.includes('youtu.be/')) {
      return new YouTubeExtractor();
    }
    if (cleanUrl.includes('instagram.com/')) {
      return new InstagramExtractor();
    }
    if (cleanUrl.includes('facebook.com/') || cleanUrl.includes('fb.watch/')) {
      return new FacebookExtractor();
    }
    if (cleanUrl.includes('tiktok.com/') || cleanUrl.includes('vm.tiktok.com/')) {
      return new TikTokExtractor();
    }
    if (cleanUrl.includes('vimeo.com/')) {
      return new VimeoExtractor();
    }
    if (cleanUrl.includes('dailymotion.com/')) {
      return new DailymotionExtractor();
    }
    if (cleanUrl.includes('twitter.com/') || cleanUrl.includes('x.com/')) {
      return new XExtractor();
    }

    // Unsupported Platform Error as requested
    throw new Error('This platform is not currently supported.');
  }
}
