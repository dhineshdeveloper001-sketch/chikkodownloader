import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import util from 'util';
const execFileAsync = util.promisify(execFile);
const ffmpegPath = require('ffmpeg-static');
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate, mediaMetadataSchema, mediaDownloadSchema, preventSSRF } from '../middleware/security';

const router = Router();

const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many download requests, please try again later.' }
});
const DOWNLOADS_DIR = path.join(__dirname, '../../downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

let ytDlpCmd = 'yt-dlp';
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
console.log(`[Startup] Resolved yt-dlp command to: ${ytDlpCmd}`);

const activeDownloads = new Map();

// Legacy simple URL validator can be removed, Zod handles it.
router.post('/metadata', authenticate, validate(mediaMetadataSchema), preventSSRF, async (req: AuthRequest, res) => {
  const { url } = req.body;

  try {
    const response = await axios.head(url).catch(() => null);
    let contentType = (response?.headers['content-type'] as string) || 'application/octet-stream';
    let filename = 'downloaded_file';
    let size = response?.headers['content-length'] ? parseInt(response.headers['content-length'] as string, 10) : null;
    let isYtDlp = false;
    let thumbnail = null;
    let videoFormats: any[] = [];
    let audioFormats: any[] = [];

    if (contentType.includes('text/html') || !response) {
      try {
        const { stdout } = await execFileAsync(ytDlpCmd, ['--dump-single-json', '--no-warnings', url], { maxBuffer: 20 * 1024 * 1024 });
        const info = JSON.parse(stdout) as any;

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

        videoFormats = Array.from(videoFormatsMap.values()).map((f: any) => {
          // Use the smallest dimension to determine standard quality (e.g., 854x480 vertical video is still 480p)
          const standardHeight = Math.min(f.width || f.height, f.height);
          let resLabel = `${standardHeight}p`;
          
          if (standardHeight === 1440) resLabel = '2K';
          if (standardHeight === 2160) resLabel = '4K';
          if (standardHeight === 4320) resLabel = '8K';
          
          return {
            formatId: f.format_id,
            resolution: resLabel,
            height: f.height, // keep original height for sorting the raw quality
            ext: f.ext,
            fps: f.fps,
            size: f.filesize || f.filesize_approx || null
          };
        }).sort((a, b) => b.height - a.height);

        audioFormats = Array.from(audioFormatsMap.values()).map((f: any) => ({
          formatId: f.format_id,
          bitrate: `${Math.round(f.abr)} kbps`,
          ext: f.ext,
          size: f.filesize || f.filesize_approx || null
        })).sort((a, b) => parseInt(b.bitrate) - parseInt(a.bitrate));

        
        filename = info.title ? `${info.title}.${info.ext || 'mp4'}` : 'video.mp4';
        filename = filename.replace(/[/\\?%*:|"<>]/g, '-'); // sanitize filename
        contentType = `video/${info.ext || 'mp4'}`;
        size = info.filesize || info.filesize_approx || null;
        thumbnail = info.thumbnail || null;
        isYtDlp = true;
      } catch (ytErr: any) {
        console.error('[Metadata Error] yt-dlp execution failed:', ytErr);
        return res.status(400).json({ error: ytErr.message || 'Unsupported media URL or video unavailable.' });
      }
    } else {
      const contentDisposition = response?.headers['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      if (filename === 'downloaded_file') {
        const urlFilename = path.basename(new URL(url).pathname);
        if (urlFilename && urlFilename.includes('.')) filename = urlFilename;
      }
    }

    // Sanitize filename to prevent filesystem mismatches on Windows
    filename = filename.replace(/[<>:"\/\\|?*]+/g, '_');

    res.json({ 
      url, 
      filename, 
      contentType, 
      size, 
      thumbnail, 
      isYtDlp,
      title: filename.replace(/\.[^/.]+$/, ""),
      duration: isYtDlp ? 'Unknown' : null, // Info.duration could be added above if needed
      formats: isYtDlp ? { video: videoFormats, audio: audioFormats } : null
    });
  } catch (err) {
    console.error('Metadata Error:', err);
    res.status(500).json({ error: 'Failed to fetch metadata or URL is not accessible.' });
  }
});

router.post('/download', authenticate, downloadLimiter, validate(mediaDownloadSchema), preventSSRF, async (req: AuthRequest, res) => {
  const { url, filename, size, contentType, isYtDlp, formatId, downloadType } = req.body;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const downloadRecord = await prisma.download.create({
      data: {
        user_id: userId,
        original_url: url,
        file_name: filename,
        file_type: contentType || 'application/octet-stream',
        file_size: BigInt(size || 0),
        status: 'downloading'
      }
    });

    // Audit log for download initiation
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: 'DOWNLOAD_START',
        details: `Started downloading: ${filename}`
      }
    });

    const activeRecord = {
      id: downloadRecord.id,
      downloaded: 0,
      size: size ? parseInt(size, 10) : 0,
      percent: 0,
      status: 'downloading'
    };
    activeDownloads.set(downloadRecord.id, activeRecord);

    res.json({ id: downloadRecord.id });

    const filePath = path.join(DOWNLOADS_DIR, `${downloadRecord.id}_${filename}`);
    
    const finalizeDownload = async () => {
      try {
        activeRecord.status = 'completed';
        await prisma.download.update({
          where: { id: downloadRecord.id },
          data: { status: 'completed' }
        });
        
        // Update stats
        const stats = await prisma.downloadStat.findFirst();
        if (stats) {
          await prisma.downloadStat.update({
            where: { id: stats.id },
            data: {
              total_downloads: { increment: 1 },
              total_storage_used: { increment: BigInt(activeRecord.size || 0) }
            }
          });
        } else {
          await prisma.downloadStat.create({
            data: {
              total_downloads: 1,
              total_storage_used: BigInt(activeRecord.size || 0)
            }
          });
        }

        setTimeout(() => activeDownloads.delete(downloadRecord.id), 5000);
      } catch (err) {
        console.error('Finalize Download Error:', err);
      }
    };

    if (isYtDlp) {
      const ytFormat = formatId ? (downloadType === 'video' ? `${formatId}+bestaudio/best` : formatId) : 'best';
      
      const ytArgs = [
        '--output', filePath,
        '--format', ytFormat,
        '--ffmpeg-location', ffmpegPath,
        '--merge-output-format', 'mp4',
        '--newline',
        url
      ];
      
      const subprocess = spawn(ytDlpCmd, ytArgs);

      subprocess.on('close', async (code) => {
        if (code !== 0) {
          activeRecord.status = 'error';
          await prisma.download.update({ where: { id: downloadRecord.id }, data: { status: 'error' } });
          setTimeout(() => activeDownloads.delete(downloadRecord.id), 2000);
          return;
        }

        if (!fs.existsSync(filePath)) {
          console.error('yt-dlp finished but output file is missing (likely an ffmpeg merge failure)');
          activeRecord.status = 'error';
          await prisma.download.update({ where: { id: downloadRecord.id }, data: { status: 'error' } });
          setTimeout(() => activeDownloads.delete(downloadRecord.id), 2000);
          return;
        }
        
        if (!activeRecord.size) {
          activeRecord.size = fs.statSync(filePath).size;
          await prisma.download.update({
            where: { id: downloadRecord.id },
            data: { file_size: BigInt(activeRecord.size) }
          });
        }
        await finalizeDownload();
      });

      subprocess.on('error', (err) => {
        console.error('yt-dlp Spawn Error:', err.message || err);
        activeRecord.status = 'error';
        prisma.download.update({
          where: { id: downloadRecord.id },
          data: { status: 'error' }
        }).catch(console.error);
        setTimeout(() => activeDownloads.delete(downloadRecord.id), 2000);
      });

      subprocess.stdout.on('data', (chunk: any) => {
        const text = chunk.toString();
        const percentMatch = text.match(/\[download\]\s+([\d.]+)%/);
        if (percentMatch) {
          activeRecord.percent = Math.round(parseFloat(percentMatch[1]));
        } else if (text.includes('Merging formats into')) {
          activeRecord.percent = 99;
        }
      });

      subprocess.stderr.on('data', (data: any) => {
        console.log('yt-dlp stderr:', data.toString());
      });

    } else {
      const writer = fs.createWriteStream(filePath);
      const response = await axios({ url, method: 'GET', responseType: 'stream' });
      const actualSize = response.headers['content-length'] ? parseInt(response.headers['content-length'] as string, 10) : 0;
      
      if (!size && actualSize) {
        activeRecord.size = actualSize;
        await prisma.download.update({
          where: { id: downloadRecord.id },
          data: { file_size: BigInt(actualSize) }
        });
      }
  
      response.data.pipe(writer);
  
      response.data.on('data', (chunk: any) => {
        activeRecord.downloaded += chunk.length;
        if (activeRecord.size) {
           activeRecord.percent = Math.round((activeRecord.downloaded / activeRecord.size) * 100);
        }
      });

      writer.on('finish', finalizeDownload);

      writer.on('error', async () => {
        activeRecord.status = 'error';
        await prisma.download.update({
          where: { id: downloadRecord.id },
          data: { status: 'error' }
        });
        activeDownloads.delete(downloadRecord.id);
      });
    }

  } catch (err: any) {
    console.error('Download Handler Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to initiate download' });
  }
});

router.get('/progress/:id', authenticate, (req, res) => {
  const { id } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const intervalId = setInterval(() => {
    const record = activeDownloads.get(id);
    if (!record) {
      res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
      clearInterval(intervalId);
      res.end();
      return;
    }

    res.write(`data: ${JSON.stringify(record)}\n\n`);
  }, 1000);

  req.on('close', () => {
    clearInterval(intervalId);
  });
});

router.get('/serve/:id', async (req, res) => {
  const { id } = req.params;
  const token = (req.query.token as string) || (req.headers.authorization ? (req.headers.authorization as string).split(' ')[1] : null);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string };
    const userId = decoded.id;

    const downloadRecord = await prisma.download.findUnique({ where: { id } });
    if (!downloadRecord || downloadRecord.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to access this file' });
    }

    const filePath = path.join(DOWNLOADS_DIR, `${id}_${downloadRecord.file_name}`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File missing from server disk' });
    }

    res.download(filePath, downloadRecord.file_name);
  } catch (err) {
    console.error('Serve Error:', err);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

export default router;
