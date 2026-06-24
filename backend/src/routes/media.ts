import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import util from 'util';
const execFileAsync = util.promisify(execFile);
const ffmpegPath = require('ffmpeg-static');
import jwt from 'jsonwebtoken';
import { RateLimitMiddleware } from '../middleware/RateLimitMiddleware';
import { MetadataOrchestrator } from '../services/MetadataOrchestrator';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate, mediaMetadataSchema, mediaDownloadSchema, preventSSRF } from '../middleware/security';

const router = Router();

const DOWNLOADS_DIR = path.join(__dirname, '../../downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

const activeDownloads = new Map();

// Legacy simple URL validator can be removed, Zod handles it.
router.post('/metadata', authenticate, RateLimitMiddleware.metadataLimiter, validate(mediaMetadataSchema), preventSSRF, async (req: AuthRequest, res) => {
  const { url } = req.body;

  try {
    const metadata = await MetadataOrchestrator.getMetadata(url);
    res.json(metadata);
  } catch (err: any) {
    console.error('Metadata Error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch metadata' });
  }
});

router.post('/download', authenticate, RateLimitMiddleware.downloadLimiter, validate(mediaDownloadSchema), preventSSRF, async (req: AuthRequest, res) => {
  const { url, filename, size, contentType, isYtDlp, formatId, downloadType } = req.body;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const ext = path.extname(filename).toLowerCase().replace('.', '');
  const allowedExtensions = ['mp4', 'mp3', 'm4a', 'webm', 'jpg', 'jpeg', 'png', 'gif', 'mkv'];
  
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ success: false, error: 'Invalid file type. Only media files are allowed.' });
  }

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
        '--no-warnings',
        '--extractor-args', 'youtube:player_client=android',
        '--extractor-args', 'youtube:player_skip=webpage,configs,js',
        '--geo-bypass',
        '--newline',
        url
      ];
      
      const subprocess = spawn(require('../services/YtDlpService').ytDlpCmd, ytArgs);

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
    res.status(500).json({ success: false, error: err.message || 'Failed to initiate download' });
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    const userId = decoded.id;

    const downloadRecord = await prisma.download.findUnique({ where: { id } });
    if (!downloadRecord || downloadRecord.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to access this file' });
    }

    const secureId = path.basename(id);
    const secureFilename = path.basename(downloadRecord.file_name);
    const filePath = path.resolve(DOWNLOADS_DIR, `${secureId}_${secureFilename}`);
    
    if (!filePath.startsWith(path.resolve(DOWNLOADS_DIR))) {
      return res.status(403).json({ error: 'Security Exception: Path Traversal Detected' });
    }

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
