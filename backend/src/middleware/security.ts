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

// Schemas
export const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const mediaMetadataSchema = z.object({
  url: z.string().url()
});

export const mediaDownloadSchema = z.object({
  url: z.string().url(),
  filename: z.string().min(1),
  size: z.number().nullable().optional(),
  contentType: z.string().min(1),
  isYtDlp: z.boolean(),
  formatId: z.string().nullable().optional(),
  downloadType: z.enum(['video', 'audio']).optional()
});

// SSRF Protection Middleware
export const preventSSRF = async (req: Request, res: Response, next: NextFunction) => {
  const { url } = req.body;
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
