import { execFile } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = util.promisify(execFile);

// Resolve yt-dlp path
export let ytDlpCmd = process.env.YTDLP_PATH || 'yt-dlp';

// Force strip .exe on Linux to prevent copied .env files from breaking the Docker build
if (process.platform !== 'win32' && ytDlpCmd.endsWith('.exe')) {
  ytDlpCmd = ytDlpCmd.replace('.exe', '');
}

const possiblePaths = [
  path.join(process.cwd(), 'yt-dlp'),
  process.env.HOME ? path.join(process.env.HOME, '.local/bin/yt-dlp') : null,
  '/usr/local/bin/yt-dlp', // Docker installation path
  '/opt/render/project/src/.venv/bin/yt-dlp',
  '/opt/render/project/.local/bin/yt-dlp'
].filter(Boolean) as string[];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    ytDlpCmd = p;
    break;
  }
}

const YTDLP_TIMEOUT = parseInt(process.env.YTDLP_TIMEOUT || '30000', 10);

export class YtDlpService {
  /**
   * Executes yt-dlp cleanly without platform-specific flags.
   */
  static async fetchMetadata(url: string): Promise<any> {
    const args = [
      '--no-warnings',
      '--dump-single-json',
      '--force-ipv4',
    ];

    const cookiesPath = path.join(process.cwd(), 'cookies.txt');
    if (fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 10) {
      args.push('--cookies', cookiesPath);
    }

    args.push(
      '--geo-bypass',
      url
    );

    console.log(`[YtDlpService] Fetching metadata for ${url}`);
    console.log(`[YtDlpService] Exact command: ${ytDlpCmd} ${args.join(' ')}`);
    try {
      const { stdout } = await execFileAsync(ytDlpCmd, args, {
        maxBuffer: 20 * 1024 * 1024,
        timeout: YTDLP_TIMEOUT, // Process killed automatically if it takes too long
      });
      const data = JSON.parse(stdout);
      return this.parseResponse(url, data);
    } catch (err: any) {
      console.error(`\n[YtDlpService] EXECUTION FAILED for URL: ${url}`);
      console.error(`[YtDlpService] Exit Code: ${err.code}`);
      console.error(`[YtDlpService] STDERR:`, err.stderr);
      console.error(`[YtDlpService] STDOUT:`, err.stdout);

      if (err.killed && err.signal === 'SIGTERM') {
        throw new Error(`yt-dlp timed out after ${YTDLP_TIMEOUT}ms`);
      }
      throw new Error(`yt-dlp error: ${err.message || err.stderr || err}`);
    }
  }

  /**
   * Parses the raw yt-dlp JSON into our separate metadata and formats structures.
   */
  private static parseResponse(url: string, info: any) {
    const videoFormatsMap = new Map();
    const audioFormatsMap = new Map();

    const formats = info.formats || [];
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

    const metadata = {
      title: info.title || 'Unknown Video',
      url,
      description: info.description || null,
      tags: info.tags || [],
      extractor: info.extractor,
    };

    return {
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration ? parseInt(info.duration, 10) : null,
      uploader: info.uploader,
      viewCount: info.view_count ? BigInt(info.view_count) : null,
      metadata,
      formats: { video: videoFormats, audio: audioFormats },
      url,
      filename: `${(info.title || 'video').replace(/[^a-zA-Z0-9]/g, '_')}.mp4`,
      isYtDlp: true,
      contentType: 'video/mp4',
      size: null
    };
  }
}
