import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface AuthPayload {
  ownerId: string;
  storeId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.auth = decoded;
    next();
  } catch (err) {
    logger.warn({ err }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
