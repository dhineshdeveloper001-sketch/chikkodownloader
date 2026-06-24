import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate, registerSchema, loginSchema } from '../middleware/security';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts, please try again later.' }
});

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password_hash }
    });

    await prisma.auditLog.create({
      data: { user_id: user.id, action: 'REGISTER', details: `User registered: ${email}` }
    });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err: any) {
    console.error('Registration error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await prisma.auditLog.create({
        data: { user_id: user.id, action: 'LOGIN_FAILED', details: `Failed login attempt for ${email}` }
      });
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    await prisma.auditLog.create({
      data: { user_id: user.id, action: 'LOGIN_SUCCESS', details: `Successful login for ${email}` }
    });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err: any) {
    console.error('Login error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user?.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err: any) {
    console.error('Auth verification error:', process.env.NODE_ENV === 'production' ? err.message : err);
    res.status(500).json({ error: 'Server error verifying session' });
  }
});

export default router;
