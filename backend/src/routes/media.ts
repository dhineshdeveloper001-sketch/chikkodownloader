import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import readline from 'readline';
import util from 'util';
const execFileAsync = util.promisify(execFile);
const ffmpegPath = require('ffmpeg-static');
import jwt from 'jsonwebtoken';
import { RateLimitMiddleware } from '../middleware/RateLimitMiddleware';
import { MediaController } from '../controllers/MediaController';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate, mediaMetadataSchema, mediaDownloadSchema, preventSSRF } from '../middleware/security';

const router = Router();

const DOWNLOADS_DIR = path.join(__dirname, '../../downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

const activeDownloads = new Map();

// Uses MediaController for multi-platform metadata extraction
router.post('/metadata', authenticate, RateLimitMiddleware.metadataLimiter, validate(mediaMetadataSchema), preventSSRF, MediaController.getMetadata);

router.get('/download', authenticate, RateLimitMiddleware.downloadLimiter, preventSSRF, async (req: AuthRequest, res) => {
  const { url, resolution, platform, title, formatId } = req.query;
  const userId = req.user?.id;
  console.log("\n=== Incoming download request ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Query Parameters:", req.query);

  if (!userId || !url) {
    console.error("[Media Route] Rejected: Missing UserID or URL");
    return res.status(401).json({ success: false, message: 'Unauthorized or Missing URL', error: 'Missing parameters', stack: 'development only' });
  }

  try {
    const cleanTitle = (title as string || 'chikko_media').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${cleanTitle}.mp4`;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const isHighRes = ['1080', '1080p', '1440', '1440p', '2k', '2160', '2160p', '4k', 'max'].includes((resolution as string || '').toLowerCase());
    
    // Check if URL is Instagram or YouTube
    const isYtDlp = platform === 'youtube' || platform === 'instagram' || !platform;
    
    // Create DB Record
    const downloadRecord = await prisma.downloadHistory.create({
      data: {
        userId,
        url: url as string,
        title: title as string || 'Media Download',
        platform: platform as string || 'unknown',
        status: 'downloading'
      }
    });

    res.on('finish', async () => {
      try {
        await prisma.downloadHistory.update({
          where: { id: downloadRecord.id },
          data: { status: 'completed' }
        });
        
        // Update stats
        const stats = await prisma.downloadStat.findFirst();
        if (stats) {
          await prisma.downloadStat.update({
            where: { id: stats.id },
            data: { total_downloads: { increment: 1 } }
          });
        }
      } catch (e) {
        console.error('Failed to update DB on stream finish:', e);
      }
    });

    if (isYtDlp) {
      // Dynamic fallback mapping
      let ytFormat = formatId ? (formatId as string) : 'best';
      if (resolution && !formatId) {
        if (isHighRes) {
          ytFormat = `bestvideo[height<=${(resolution as string).replace('p','')}]+bestaudio/best`;
        } else {
          ytFormat = `best[height<=${(resolution as string).replace('p','')}]/best`;
        }
      }

      const cookiesPath = path.join(process.cwd(), 'cookies.txt');
      const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 10;
      const ytDlpCmd = require('../services/YtDlpService').ytDlpCmd;

      if (isHighRes || ytFormat.includes('+')) {
        // High Res Zero-Disk Multiplexing Strategy using native FFmpeg Pipes
        // yt-dlp cannot concurrently stream two files to stdout, so we extract URLs and use ffmpeg
        const jArgs = ['-f', ytFormat, '-J', '--no-warnings', '--geo-bypass', '--force-ipv4'];
        if (hasCookies) jArgs.push('--cookies', cookiesPath);
        jArgs.push(url as string);

        console.log("[Media Route] Executing yt-dlp -J command:", ytDlpCmd, jArgs.join(' '));
        try {
          const { stdout: jsonStdout } = await execFileAsync(ytDlpCmd, jArgs, { timeout: 45000, maxBuffer: 20 * 1024 * 1024 });
          const info = JSON.parse(jsonStdout);
          
          const requestedFormats = info.requested_formats || [info];
          const urls = requestedFormats.map((f: any) => f.url).filter(Boolean);
          
          if (urls.length === 0) throw new Error('No stream URLs found in yt-dlp JSON output');

          const ffmpegArgs = [];
          
          // Extract headers from yt-dlp JSON to bypass YouTube 403 Forbidden during FFmpeg fetch
          const headersObj = requestedFormats[0]?.http_headers || info.http_headers || {};
          let headersString = '';
          for (const [key, value] of Object.entries(headersObj)) {
            headersString += `${key}: ${value}\r\n`;
          }

          for (const u of urls) {
             if (headersString) {
               ffmpegArgs.push('-headers', headersString);
             }
             ffmpegArgs.push('-i', u);
          }
          
          ffmpegArgs.push(
             '-c', 'copy',
             '-movflags', 'frag_keyframe+empty_moov',
             '-f', 'mp4',
             'pipe:1'
          );

          // STRICTLY enforce OS-level ffmpeg in production to avoid Alpine/Slim binary crashes
          const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : (require('ffmpeg-static') || 'ffmpeg');
          
          console.log("[Media Route] Spawning ffmpeg pipeline:", ffmpegPath, ffmpegArgs.join(' '));
          const subprocess = spawn(ffmpegPath, ffmpegArgs);
          
          subprocess.stdout.pipe(res);

          // Capture FFmpeg stderr to log exactly why the multiplexing crashed
          subprocess.stderr.on('data', (data) => {
            console.error(`[FFmpeg STDERR]: ${data.toString()}`);
          });

          subprocess.on('error', async (err: any) => {
            console.error('[Media Route] FFmpeg Spawn Error Stack Trace:', err.stack || err);
            if (!res.headersSent) res.status(500).json({ success: false, stage: 'ffmpeg_spawn', message: 'Stream failed', error: err.message, stack: err.stack });
            else res.end();
            await prisma.downloadHistory.update({
              where: { id: downloadRecord.id },
              data: { status: 'error' }
            }).catch(console.error);
          });
          
          subprocess.on('close', (code) => {
             if (code !== 0) {
               console.error(`[Media Route] FFmpeg process exited with code ${code}`);
             }
          });
          
        } catch (err: any) {
          console.error('[Media Route] yt-dlp JSON Extraction Error Stack Trace:', err.stack || err);
          if (!res.headersSent) res.status(500).json({ success: false, stage: 'ytdlp_extraction', message: 'Stream extraction failed', error: err.message, stack: err.stack });
          await prisma.downloadHistory.update({
            where: { id: downloadRecord.id },
            data: { status: 'error' }
          }).catch(console.error);
        }

      } else {
        // Standard single-stream pipe for 720p or audio
        const ytArgs = [
          '-f', ytFormat,
          '-o', '-',
          '--no-warnings',
          '--geo-bypass',
          '--force-ipv4'
        ];
        if (hasCookies) ytArgs.push('--cookies', cookiesPath);
        ytArgs.push(url as string);
        console.log("[Media Route] Spawning yt-dlp single-stream:", ytDlpCmd, ytArgs.join(' '));
        const subprocess = spawn(ytDlpCmd, ytArgs);
        subprocess.stdout.pipe(res);

        subprocess.stderr.on('data', (data) => {
          console.error(`[yt-dlp STDERR]: ${data.toString()}`);
        });

        subprocess.on('error', async (err: any) => {
          console.error('[Media Route] yt-dlp Spawn Error Stack Trace:', err.stack || err);
          if (!res.headersSent) res.status(500).json({ success: false, stage: 'ytdlp_spawn', message: 'Stream failed', error: err.message, stack: err.stack });
          else res.end();
          await prisma.downloadHistory.update({
            where: { id: downloadRecord.id },
            data: { status: 'error' }
          }).catch(console.error);
        });

        subprocess.on('close', (code) => {
           if (code !== 0) {
             console.error(`[Media Route] yt-dlp process exited with code ${code}`);
           }
        });
      }

    } else {
      // Direct stream pipe from CDN if not yt-dlp native
      const response = await axios({ url: url as string, method: 'GET', responseType: 'stream' });
      response.data.pipe(res);
      response.data.on('error', (err: any) => {
        console.error('Axios Stream Error:', err.message);
        res.end();
      });
    }

  } catch (err: any) {
    console.error('Download Handler Error:', err.stack || err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, stage: 'download_handler', message: 'Failed to initiate download stream', error: err.message, stack: err.stack });
    }
  }
});

export default router;
