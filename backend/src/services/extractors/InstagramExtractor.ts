import axios from 'axios';
import { MediaExtractor } from './MediaExtractor';

export class InstagramExtractor implements MediaExtractor {
  extractId(url: string): string | null {
    const match = url.match(/(?:facebook\.com|fb\.watch|instagram\.com\/(?:reel|p)\/|instagr\.am\/(?:reel|p)\/).*?([a-zA-Z0-9_-]+)/i);
    if (match) return `ig_${match[1]}`;
    return null;
  }

  /**
   * Extracts direct video stream links from Instagram Reels/Posts without requiring active session cookies.
   * Uses a dual-stage pipeline: Mobile API Emulation with a fallback to public proxy routing gateways.
   * @param url - Clean Instagram media URL
   * @param qualityInput - Resolution string from frontend select component ('240' to '4k')
   */
  public async extract(url: string, qualityInput: string = '1080'): Promise<any> {
    // Clean and normalize the incoming URL
    let cleanUrl = url.split('?')[0];
    if (!cleanUrl.endsWith('/')) {
      cleanUrl += '/';
    }

    // 1. Map frontend human-readable resolution dropdown values to API strings
    let targetResolution = '1080';
    if (['240', '360', '480', '720', '1080'].includes(qualityInput)) {
      targetResolution = qualityInput;
    } else if (qualityInput === '2k') {
      targetResolution = '1440';
    } else if (qualityInput === '4k') {
      targetResolution = '2160';
    }

    // List of reliable public mirrors to handle request parsing anonymously if primary fails
    const API_ENDPOINTS = [
      `https://api.cobalt.tools/`,
      `https://cobalt.api.v0.pw/`,
      `https://api.kuko.space/`
    ];

    let lastError: any = null;

    // 2. Execution Loop: Dynamic Fallback Architecture
    for (const endpoint of API_ENDPOINTS) {
      try {
        const response = await axios.post(
          endpoint,
          {
            url: cleanUrl,
            videoQuality: targetResolution === '2160' || targetResolution === '1440' ? 'max' : targetResolution,
            audioFormat: 'mp3',
            downloadMode: 'auto',
            filenameStyle: 'pretty'
          },
          {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
            },
            timeout: 12000 // 12-second failover threshold per node
          }
        );

        if (response.data && (response.data.status === 'redirect' || response.data.status === 'tunnel' || response.data.status === 'stream')) {
          const title = response.data.filename || 'Chikko Instagram Media';
          const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
          const videoUrl = response.data.url;
          const resUsed = targetResolution === '1080' ? 'Native HD Source' : `${targetResolution}p Clamped`;

          return {
            title: title,
            thumbnail: '', 
            downloadUrl: videoUrl, // Directly streamable CDN resource links
            platform: 'instagram',
            resolutionUsed: resUsed,
            // Added backend schema required fields
            formats: {
               video: [{ formatId: 'default', resolution: resUsed, url: videoUrl, ext: 'mp4', size: 0 }],
               audio: []
            },
            url: videoUrl,
            filename: `${cleanTitle || 'instagram_media'}.mp4`,
            isYtDlp: false,
            contentType: 'video/mp4'
          };
        }
        
        if (response.data && response.data.status === 'error') {
          lastError = new Error(response.data.text || response.data.error?.code);
          continue; // Try next mirror cluster node
        }

      } catch (err: any) {
        lastError = err;
        // Silent recovery tracking, instantly shifting to the next redundant cluster node
        continue; 
      }
    }

    // 3. Fallback Route: Direct Payload Stream Scraping Strategy
    try {
      const mobileJsonUrl = `${cleanUrl}?__a=1&__d=dis`;
      const directResponse = await axios.get(mobileJsonUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json'
        },
        timeout: 8000
      });

      const mediaData = directResponse.data?.graphql?.shortcode_media || directResponse.data?.items?.[0];
      const directVideoUrl = mediaData?.video_url || mediaData?.video_versions?.[0]?.url;

      if (directVideoUrl) {
        const title = 'Chikko Extracted Media (Direct Stream)';
        return {
          title: title,
          thumbnail: mediaData?.display_url || '',
          downloadUrl: directVideoUrl,
          platform: 'instagram',
          resolutionUsed: 'Native High Quality',
          // Added backend schema required fields
          formats: {
             video: [{ formatId: 'default', resolution: 'Native High Quality', url: directVideoUrl, ext: 'mp4', size: 0 }],
             audio: []
          },
          url: directVideoUrl,
          filename: `instagram_direct_stream.mp4`,
          isYtDlp: false,
          contentType: 'video/mp4'
        };
      }
    } catch (fallbackErr: any) {
      console.error('Fallback Direct URL error:', fallbackErr.message);
      throw new Error(`All extraction cluster pipelines exhausted. Primary Fail Reason: ${lastError?.message || fallbackErr.message}`);
    }

    throw new Error('Instagram security blocked full payload extraction. Please try another URL.');
  }

  async extractMetadata(url: string, qualityInput?: string): Promise<any> {
    return this.extract(url, qualityInput || '1080');
  }
}

