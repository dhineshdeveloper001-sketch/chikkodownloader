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
      where: { user_id: req.user?.id },
      orderBy: { download_date: 'desc' },
      take: limit + 1, // Fetch one extra to determine if there's a next page
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
    }

    const userDownloads = await prisma.download.findMany(queryOptions);

    let nextCursor: string | null = null;
    if (userDownloads.length > limit) {
      const nextItem = userDownloads.pop();
      nextCursor = nextItem?.id || null;
    }

    const history = userDownloads.map((d: any) => ({
      id: d.id,
      url: d.original_url,
      filename: d.file_name,
      type: d.file_type,
      size: d.file_size.toString(),
      date: d.download_date,
      status: d.status
    }));

    res.json({ history, nextCursor });
  } catch (err: any) {
    console.error('History API error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/dashboard', authenticate, async (req: AuthRequest, res) => {
  try {
    const userDownloads = await prisma.download.findMany({
      where: { user_id: req.user?.id }
    });

    const totalDownloads = userDownloads.length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const downloadsToday = userDownloads.filter(d => new Date(d.download_date) >= today).length;

    let storageUsed = BigInt(0);
    const fileTypes: Record<string, number> = {};

    userDownloads.forEach(d => {
      if (d.status === 'completed') {
        storageUsed += d.file_size;
        const mainType = d.file_type.split('/')[0] || 'other';
        fileTypes[mainType] = (fileTypes[mainType] || 0) + 1;
      }
    });

    res.json({
      totalDownloads,
      downloadsToday,
      storageUsed: storageUsed.toString(),
      fileTypes
    });

  } catch (err: any) {
    console.error('Dashboard API error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
