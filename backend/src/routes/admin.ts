import { Router, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Middleware to strictly enforce Admin role
const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Security Exception: Administrator privileges required.' });
    }
    next();
  } catch (err: any) {
    console.error('Admin Check Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to verify permissions' });
  }
};

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many admin requests, please try again later.' }
});

router.use(authenticate, requireAdmin, adminLimiter);

// Dashboard Overview
router.get('/overview', async (req: AuthRequest, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalDownloads = await prisma.download.count();
    
    const downloads = await prisma.download.findMany({
      where: { status: 'completed' },
      select: { file_size: true }
    });
    const totalStorage = downloads.reduce((acc, curr) => acc + curr.file_size, BigInt(0));

    res.json({
      totalUsers,
      totalDownloads,
      totalStorage: totalStorage.toString(),
      systemStatus: 'healthy'
    });
  } catch (err: any) {
    console.error('Admin Overview Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch admin overview' });
  }
});

// Audit Logs
router.get('/audits', async (req: AuthRequest, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const logs = await prisma.auditLog.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      include: {
        user: { select: { email: true } }
      }
    });

    res.json({ logs });
  } catch (err: any) {
    console.error('Admin Audits Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.delete('/audits/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.auditLog.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Audit log deleted successfully' });
  } catch (err: any) {
    console.error('Admin Delete Audit Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to delete audit log' });
  }
});

router.delete('/audits', async (req: AuthRequest, res) => {
  try {
    await prisma.auditLog.deleteMany({});
    res.json({ message: 'All audit logs cleared successfully' });
  } catch (err: any) {
    console.error('Admin Clear Audits Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to clear audit logs' });
  }
});

// Users
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
        _count: { select: { downloads: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json({ users });
  } catch (err: any) {
    console.error('Admin Users Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.delete('/users/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    // Prevent self-deletion
    if (id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }
    
    // Note: Due to Cascade delete on Download model, all associated downloads are deleted from DB automatically.
    // However, physical files aren't wiped here. We can leave it as a known technical debt or implement a file wipe.
    // For MVP, DB cascade is enough.
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User deleted successfully' });
  } catch (err: any) {
    console.error('Admin Delete User Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Downloads
router.get('/downloads', async (req: AuthRequest, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const downloads = await prisma.download.findMany({
      orderBy: { download_date: 'desc' },
      take: limit,
      include: {
        user: { select: { email: true } }
      }
    });
    res.json({ downloads });
  } catch (err: any) {
    console.error('Admin Downloads Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch downloads' });
  }
});

router.delete('/downloads/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    
    // Attempt to delete physical file if it exists
    const downloadRecord = await prisma.download.findUnique({ where: { id } });
    if (downloadRecord) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'downloads', `${id}_${downloadRecord.file_name}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await prisma.download.delete({ where: { id } });
    res.json({ message: 'Download log and file deleted successfully' });
  } catch (err: any) {
    console.error('Admin Delete Download Error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to delete download' });
  }
});

export default router;
