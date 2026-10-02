import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  id: string;
  phone: string;
  role: 'patient' | 'doctor' | 'admin';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function sign(u: AuthUser) {
  return jwt.sign(u, config.jwtSecret, { expiresIn: config.jwtTtl as jwt.SignOptions['expiresIn'] });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(h.slice(7), config.jwtSecret) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

export function requireRole(role: AuthUser['role']) {
  return (req: Request, res: Response, next: NextFunction) =>
    req.user?.role === role || req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'forbidden' });
}
