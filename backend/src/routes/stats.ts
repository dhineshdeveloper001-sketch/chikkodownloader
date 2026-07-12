import { Router } from 'express';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Used BigInt serialization
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

router.get('/history', authenticate, async (req: AuthRequest, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const cursor = req.query.cursor as string | undefined;

    const queryOptions: any = {
      where: { userId: req.user?.id },
      orderBy: { downloadTime: 'desc' },
      take: limit + 1, // Fetch one extra to determine if there's a next page
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
    }

    const userDownloads = await prisma.downloadHistory.findMany(queryOptions);

    let nextCursor: string | null = null;
    if (userDownloads.length > limit) {
      const nextItem = userDownloads.pop();
      nextCursor = nextItem?.id || null;
    }

    const history = userDownloads.map((d: any) => ({
      id: d.id,
      url: d.url,
      title: d.title,
      platform: d.platform,
      thumbnail: d.thumbnail,
      date: d.downloadTime,
      status: d.status
    }));

    res.json({ success: true, history, nextCursor });
  } catch (err: any) {
    console.error('History API error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

router.delete('/history', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.downloadHistory.deleteMany({
      where: { userId: req.user?.id }
    });
    res.json({ success: true, message: 'History cleared' });
  } catch(err: any) {
    res.status(500).json({ success: false, message: 'Failed to clear history' });
  }
});

router.get('/dashboard', authenticate, async (req: AuthRequest, res) => {
  try {
    const userDownloads = await prisma.downloadHistory.findMany({
      where: { userId: req.user?.id }
    });

    const totalDownloads = userDownloads.length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const downloadsToday = userDownloads.filter(d => new Date(d.downloadTime) >= today).length;

    const fileTypes: Record<string, number> = {};

    userDownloads.forEach(d => {
      if (d.status === 'completed') {
        fileTypes[d.platform] = (fileTypes[d.platform] || 0) + 1;
      }
    });

    res.json({
      success: true,
      totalDownloads,
      downloadsToday,
      storageUsed: 0, // removed size from db to keep it simple, we can return 0
      fileTypes
    });

  } catch (err: any) {
    console.error('Dashboard API error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
});

export default router;
