import fs from 'fs';
import path from 'path';
import util from 'util';
import { execFile } from 'child_process';
import axios from 'axios';
import { CacheRepository } from '../repositories/CacheRepository';

const cacheRepo = new CacheRepository();
import { MonitoringService } from './MonitoringService';
import { BackgroundRefreshWorker } from '../workers/BackgroundRefreshWorker';

const execFileAsync = util.promisify(execFile);

// Resolve yt-dlp path
export let ytDlpCmd = 'yt-dlp';
const possiblePaths = [
  path.join(process.cwd(), 'yt-dlp'),
  process.env.HOME ? path.join(process.env.HOME, '.local/bin/yt-dlp') : null,
  '/opt/render/project/src/.venv/bin/yt-dlp',
  '/opt/render/project/.local/bin/yt-dlp'
].filter(Boolean) as string[];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    ytDlpCmd = p;
    break;
  }
}
console.log(`[MetadataService] Resolved yt-dlp command to: ${ytDlpCmd}`);

export const cookiesPath = path.join(__dirname, '../../../cookies.txt');
export const ytBaseArgs = [
  '--no-warnings',
  '--extractor-args', 'youtube:player_client=ios,android,web',
  '--extractor-args', 'youtube:player_skip=webpage,configs,js',
  '--geo-bypass',
  '--rm-cache-dir'
];
if (fs.existsSync(cookiesPath)) {
  ytBaseArgs.push('--cookies', cookiesPath);
}

// In-Flight Deduplication Map
const pendingRequests = new Map<string, Promise<any>>();

export class MetadataService {
  static extractVideoId(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be')) {
        return parsedUrl.searchParams.get('v') || parsedUrl.pathname.split('/').pop() || null;
      }
      return url; // For non-youtube, use the full URL as ID
    } catch {
      return null;
    }
  }

  static async getMetadata(url: string) {
    const startTime = MonitoringService.recordRequestStart();
    try {
      const result = await this.getMetadataInternal(url);
      MonitoringService.recordRequestEnd(startTime, true);
      return result;
    } catch (err) {
      MonitoringService.recordRequestEnd(startTime, false);
      throw err;
    }
  }

  private static async getMetadataInternal(url: string) {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid URL or cannot extract Video ID');
    }

    const cachedData = await cacheRepo.getStaleCache(videoId);
    if (cachedData) {
      const ageHours = (Date.now() - cachedData.last_fetched_at.getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) {
        MonitoringService.recordCacheHit();
        return { ...cachedData.metadata_json as any, isStale: false, fromCache: true };
      }
      
      // Cache Expired: Phase 6 - Queue refresh and return stale instantly
      MonitoringService.recordStaleCacheReturn();
      BackgroundRefreshWorker.queueRefresh(videoId, url);
      return { ...cachedData.metadata_json as any, isStale: true, fromCache: true, refreshQueued: true };
    }

    MonitoringService.recordCacheMiss();

    // In-Flight Deduplication (Phase 4)
    if (pendingRequests.has(videoId)) {
      console.log(`[Deduplication] Waiting for existing fetch: ${videoId}`);
      return pendingRequests.get(videoId);
    }

    const fetchPromise = this.fetchFreshMetadata(url, videoId, cachedData);
    pendingRequests.set(videoId, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      pendingRequests.delete(videoId);
    }
  }

  // Exposed for BackgroundWorker to bypass cache age check
  static async forceRefresh(url: string, videoId: string) {
    const cachedData = await cacheRepo.getStaleCache(videoId);
    return this.fetchFreshMetadata(url, videoId, cachedData);
  }

  private static async fetchFreshMetadata(url: string, videoId: string, cachedData: any) {
    try {
      const response = await axios.head(url).catch(() => null);
      let contentType = (response?.headers['content-type'] as string) || 'application/octet-stream';
      
      if (contentType.includes('text/html') || !response) {
        // Run yt-dlp
        const { stdout } = await execFileAsync(ytDlpCmd, [...ytBaseArgs, '--dump-single-json', url], { maxBuffer: 20 * 1024 * 1024 });
        const info = JSON.parse(stdout) as any;

        // Extract formats as before
        const formats = info.formats || [];
        const videoFormatsMap = new Map();
        const audioFormatsMap = new Map();

        formats.forEach((f: any) => {
          if (f.vcodec === 'none' && f.acodec !== 'none') {
            const abr = Math.round(f.abr || 0);
            if (abr > 0) audioFormatsMap.set(abr, f);
          }
          if (f.vcodec !== 'none') {
            const height = f.height;
            if (height) {
              const existing = videoFormatsMap.get(height);
              if (!existing || f.fps > existing.fps || (f.fps === existing.fps && f.ext === 'mp4')) {
                videoFormatsMap.set(height, f);
              }
            }
          }
        });

        const videoFormats = Array.from(videoFormatsMap.values()).map((f: any) => {
          const standardHeight = Math.min(f.width || f.height, f.height);
          let resLabel = `${standardHeight}p`;
          if (standardHeight === 1440) resLabel = '2K';
          if (standardHeight === 2160) resLabel = '4K';
          if (standardHeight === 4320) resLabel = '8K';
          
          return {
            formatId: f.format_id,
            resolution: resLabel,
            height: f.height,
            ext: f.ext,
            fps: f.fps,
            size: f.filesize || f.filesize_approx || null
          };
        }).sort((a, b) => b.height - a.height);

        const audioFormats = Array.from(audioFormatsMap.values()).map((f: any) => ({
          formatId: f.format_id,
          bitrate: `${Math.round(f.abr)} kbps`,
          ext: f.ext,
          size: f.filesize || f.filesize_approx || null
        })).sort((a, b) => parseInt(b.bitrate) - parseInt(a.bitrate));

        let filename = info.title ? `${info.title}.${info.ext || 'mp4'}` : 'video.mp4';
        filename = filename.replace(/[/\\?%*:|"<>]/g, '-').replace(/[<>:"\/\\|?*]+/g, '_');
        contentType = `video/${info.ext || 'mp4'}`;
        const size = info.filesize || info.filesize_approx || null;

        const metadataPayload = { 
          url, 
          filename, 
          contentType, 
          size, 
          thumbnail: info.thumbnail || null, 
          isYtDlp: true,
          title: filename.replace(/\.[^/.]+$/, ""),
          duration: info.duration ? 'Unknown' : null,
          formats: { video: videoFormats, audio: audioFormats }
        };

        // Save to Cache (Phase 2)
        await cacheRepo.upsertCache(videoId, url, metadataPayload);

        return { ...metadataPayload, isStale: false, fromCache: false };
      } else {
        // Direct file
        let filename = 'downloaded_file';
        const contentDisposition = response?.headers['content-disposition'];
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match && match[1]) filename = match[1];
        }
        if (filename === 'downloaded_file') {
          const urlFilename = path.basename(new URL(url).pathname);
          if (urlFilename && urlFilename.includes('.')) filename = urlFilename;
        }
        filename = filename.replace(/[<>:"\/\\|?*]+/g, '_');
        const size = response?.headers['content-length'] ? parseInt(response.headers['content-length'] as string, 10) : null;

        return { url, filename, contentType, size, thumbnail: null, isYtDlp: false, title: filename.replace(/\.[^/.]+$/, ""), duration: null, formats: null };
      }
    } catch (err: any) {
      // Stale Fallback Strategy (Phase 3)
      if (cachedData) {
        console.warn(`[Fallback] yt-dlp failed, returning stale cache for ${videoId}`);
        await cacheRepo.markFailure(videoId, url, err.message);
        MonitoringService.recordStaleCacheReturn();
        return { ...cachedData.metadata_json as any, isStale: true, fromCache: true };
      }
      throw new Error(`[Metadata Fetch Failed] ${err.message || 'Unknown error'}`);
    }
  }
}
