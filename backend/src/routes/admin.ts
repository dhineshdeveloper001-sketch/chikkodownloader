import { Router, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { RateLimitMiddleware } from '../middleware/RateLimitMiddleware';

const router = Router();

// Middleware to strictly enforce Admin role
const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  } catch (err: any) {
    console.error('Admin Check Error:', err.message);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
};

router.use(authenticate, requireAdmin, RateLimitMiddleware.adminLimiter);

// Dashboard Overview
router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalDownloads = await prisma.downloadHistory.count();
    
    // Today's downloads
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todaysDownloads = await prisma.downloadHistory.count({
      where: { downloadTime: { gte: startOfToday } }
    });

    const successfulDownloads = await prisma.downloadHistory.count({
      where: { status: 'completed' }
    });

    const failedDownloads = await prisma.downloadHistory.count({
      where: { status: 'error' }
    });

    // Top Platforms
    const platformStats = await prisma.downloadHistory.groupBy({
      by: ['platform'],
      _count: { platform: true },
      orderBy: { _count: { platform: 'desc' } },
      take: 5
    });

    const recentDownloads = await prisma.downloadHistory.findMany({
      orderBy: { downloadTime: 'desc' },
      take: 10,
      include: { user: { select: { username: true } } }
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalDownloads,
        todaysDownloads,
        successfulDownloads,
        failedDownloads,
        topPlatforms: platformStats.map(p => ({ platform: p.platform, count: p._count.platform })),
        recentDownloads: recentDownloads.map(d => ({
          id: d.id,
          username: d.user.username,
          platform: d.platform,
          title: d.title,
          status: d.status,
          time: d.downloadTime
        }))
      }
    });
  } catch (err: any) {
    console.error('Admin Dashboard Error:', err.message);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

// Users Search
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const search = req.query.search as string;
    const users = await prisma.user.findMany({
      where: search ? { username: { contains: search, mode: 'insensitive' } } : {},
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
        _count: { select: { downloads: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ success: true, users });
  } catch (err: any) {
    console.error('Admin Users Error:', err.message);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

router.put('/user/:id/deactivate', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (id === req.user?.id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' });
    }
    
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
       return res.status(404).json({ success: false, message: 'User not found' });
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive }
    });

    await prisma.auditLog.create({
      data: { userId: req.user?.id, action: 'ADMIN_DEACTIVATE_USER', details: `Toggled user ${user.username} active status to ${!user.isActive}` }
    });

    res.json({ success: true, message: `User ${!user.isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (err: any) {
    console.error('Admin Deactivate User Error:', err.message);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

export default router;
