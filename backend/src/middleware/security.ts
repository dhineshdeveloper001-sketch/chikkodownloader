import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import dns from 'dns/promises';
import ipaddr from 'ipaddr.js';

// Zod Validation Middleware
export const validate = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation Error', details: (error as any).errors });
      }
      return res.status(400).json({ error: 'Internal validation error' });
    }
  };
};

export const registerSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{4,20}$/, 'Username must be 4-20 characters long and can only contain letters, numbers, and underscores'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const mediaMetadataSchema = z.object({
  url: z.string().url(),
  quality: z.string().optional()
});

export const mediaDownloadSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1),
  size: z.number().nullable().optional(),
  contentType: z.string().min(1),
  isYtDlp: z.boolean(),
  formatId: z.string().nullable().optional(),
  downloadType: z.enum(['video', 'audio']).optional(),
  platform: z.string().min(1),
  title: z.string().min(1),
  thumbnail: z.string().nullable().optional()
});

// SSRF Protection Middleware
export const preventSSRF = async (req: Request, res: Response, next: NextFunction) => {
  const url = req.body?.url || req.query?.url;
  if (!url) return next();

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    // Resolve hostname to IP using OS native lookup
    const { address } = await dns.lookup(hostname);
    if (!address) {
      return res.status(400).json({ error: 'Invalid URL hostname' });
    }

    const addr = ipaddr.parse(address);

    // Only allow public unicast IPs
    if (addr.range() !== 'unicast') {
      return res.status(403).json({ error: 'Security Exception: Cannot access internal networks (SSRF Blocked)' });
    }
    
    next();
  } catch (err) {
    return res.status(400).json({ error: 'Failed to resolve URL (SSRF Blocked)' });
  }
};
