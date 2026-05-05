import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { queryOne } from '../../database/connection';
import { generateToken, requireAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'email and password required' });
      return;
    }

    const owner = await queryOne<{
      id: string;
      store_id: string;
      email: string;
      password_hash: string;
      name: string;
      role: string;
      is_active: boolean;
    }>(
      'SELECT * FROM store_owners WHERE LOWER(email) = LOWER($1) AND is_active = true',
      [email]
    );

    if (!owner || !(await bcrypt.compare(password, owner.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await queryOne('UPDATE store_owners SET last_login_at = NOW() WHERE id = $1', [owner.id]);

    const token = generateToken({
      ownerId: owner.id,
      storeId: owner.store_id,
      email: owner.email,
      role: owner.role,
    });

    res.json({
      token,
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role },
    });
  } catch (err) {
    logger.error({ err }, 'Login failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/auth/register — only open in dev or with setup secret header
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const setupSecret = req.headers['x-setup-secret'];
    if (process.env.NODE_ENV === 'production' && setupSecret !== process.env.SETUP_SECRET) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { email, password, name, store_id } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      store_id?: string;
    };

    if (!email || !password || !store_id) {
      res.status(400).json({ error: 'email, password, store_id required' });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const owner = await queryOne<{ id: string }>(
      `INSERT INTO store_owners (store_id, email, password_hash, name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [store_id, email.toLowerCase(), hash, name || email]
    );

    res.status(201).json({ id: owner?.id, message: 'Owner created' });
  } catch (err) {
    logger.error({ err }, 'Register failed');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/auth/me
router.get('/me', requireAuth, (req: Request, res: Response): void => {
  res.json({ auth: req.auth });
});

export default router;
