import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate, registerSchema, loginSchema } from '../middleware/security';
import { RateLimitMiddleware } from '../middleware/RateLimitMiddleware';

const router = Router();

// Configure cookie options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  path: '/',
  maxAge: 30 * 60 * 1000 // 30 minutes
});

router.post('/signup', RateLimitMiddleware.signupLimiter, validate(registerSchema), async (req, res) => {
  const { username, password } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    const user = await prisma.user.create({
      data: { username, passwordHash }
    });

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'REGISTER', details: `User registered: ${username}` }
    });

    res.json({ success: true, message: 'Account created successfully' });
  } catch (err: any) {
    console.error('Registration error:', err.message);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

router.post('/login', RateLimitMiddleware.loginLimiter, validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    // Check lockout
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      return res.status(429).json({ success: false, message: 'Account temporarily locked. Please try again later.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    
    if (!isMatch) {
      const newAttempts = user.failedAttempts + 1;
      let lockedUntil = user.lockedUntil;

      if (newAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
        await prisma.auditLog.create({
           data: { userId: user.id, action: 'ACCOUNT_LOCK', details: `Account locked for 15 mins` }
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: newAttempts, lockedUntil }
      });

      await prisma.auditLog.create({
        data: { userId: user.id, action: 'LOGIN_FAILED', details: 'Failed login attempt' }
      });
      
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Successful Login
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        failedAttempts: 0, 
        lockedUntil: null, 
        lastLogin: new Date() 
      }
    });

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'LOGIN_SUCCESS', details: 'Successful login' }
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role }, 
      process.env.JWT_SECRET!, 
      { expiresIn: '30m' }
    );

    res.cookie('token', token, getCookieOptions());
    
    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username, role: user.role } 
    });
  } catch (err: any) {
    console.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

router.post('/logout', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.auditLog.create({
      data: { userId: req.user?.id, action: 'LOGOUT', details: 'User logged out' }
    });
    
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/'
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch(err: any) {
    console.error('Logout error:', err.message);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

router.get('/me', async (req: AuthRequest, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(200).json({ authenticated: false, message: 'No active session' });
    }

    const secret = process.env.JWT_SECRET!;
    let decoded;
    try {
      decoded = jwt.verify(token, secret) as { userId: string, username: string, role: string };
    } catch (err) {
      return res.status(200).json({ authenticated: false, message: 'Session expired' });
    }

    if (!decoded || !decoded.userId) {
      return res.status(200).json({ authenticated: false, message: 'Invalid session payload' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) {
      return res.status(200).json({ authenticated: false, message: 'Account deactivated or missing' });
    }
    
    res.json({ 
      authenticated: true,
      user: { id: user.id, username: user.username, role: user.role } 
    });
  } catch (err: any) {
    console.error('Auth verification error:', err.message);
    res.status(500).json({ success: false, message: 'An internal error occurred' });
  }
});

export default router;
