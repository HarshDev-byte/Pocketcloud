import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import { User } from '../db/types';
import { AppError, ValidationError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface SafeUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  quota_bytes: number | null;
  created_at: number;
  last_login: number | null;
  is_guest?: number;
  guest_expires_at?: number | null;
  totp_enabled?: number;
}

interface LoginMeta {
  ip: string;
  userAgent?: string;
}

interface LoginResult {
  token: string;
  user: SafeUser;
}

const COOKIE_MAX_AGE_DAYS = parseInt(process.env.COOKIE_MAX_AGE_DAYS || '7');

export class AuthService {
  private static toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      quota_bytes: user.quota_bytes,
      created_at: user.created_at,
      last_login: user.last_login
    };
  }

  static async createUser(username: string, password: string, role: 'admin' | 'user' = 'user'): Promise<SafeUser> {
    // Validate username
    if (!username || typeof username !== 'string') {
      throw new ValidationError('Username is required');
    }
    
    if (username.length < 3 || username.length > 32) {
      throw new ValidationError('Username must be 3-32 characters long');
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new ValidationError('Username can only contain letters, numbers, and underscores');
    }

    // Validate password
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required');
    }
    
    if (password.length < 8 || password.length > 128) {
      throw new ValidationError('Password must be 8-128 characters long');
    }

    // Check if username is already taken (case-insensitive)
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
    if (existingUser) {
      throw new ConflictError('Username already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const userId = uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, quota_bytes, is_active, created_at, last_login)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(userId, username, passwordHash, role, null, now, null);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;
    
    logger.info('User created', { userId, username, role });
    
    return this.toSafeUser(user);
  }

  static async login(username: string, password: string, meta: LoginMeta): Promise<LoginResult> {
    // Get user (case-insensitive username lookup)
    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as User | undefined;
    
    // Always run bcrypt.compare to prevent timing-based username enumeration
    const hash = user?.password_hash ?? '$2b$12$invalidhashtopreventtimingattacks.invalidhashtopreventtimingattacks';
    const valid = await bcrypt.compare(password, hash);
    
    if (!user || !valid || !user.is_active) {
      logger.warn('Login attempt failed', { username, ip: meta.ip });
      throw new AppError('AUTH_FAILED', 'Invalid credentials', 401);
    }

    // Generate session token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Clean up old sessions (keep max 5 per user)
    const sessions = db.prepare('SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at ASC').all(user.id) as { id: string }[];
    if (sessions.length >= 5) {
      // Delete oldest sessions
      const sessionsToDelete = sessions.slice(0, sessions.length - 4);
      for (const session of sessionsToDelete) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
      }
    }

    // Create new session
    const sessionId = uuidv4();
    const now = Date.now();
    const expiresAt = now + (COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, user.id, tokenHash, meta.ip, meta.userAgent || null, now, expiresAt);

    // Update last login
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, user.id);

    logger.info('User logged in', { userId: user.id, username: user.username, ip: meta.ip });

    return {
      token: rawToken,
      user: this.toSafeUser({ ...user, last_login: now })
    };
  }

  static async validateSession(rawToken: string): Promise<SafeUser> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AppError('INVALID_SESSION', 'Session token required', 401);
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = Date.now();

    const session = db.prepare(`
      SELECT s.*, u.id as user_id, u.username, u.role, u.quota_bytes, u.is_active, u.created_at, u.last_login
      FROM sessions s 
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
    `).get(tokenHash, now) as any;

    if (!session) {
      throw new AppError('INVALID_SESSION', 'Session expired or invalid', 401);
    }

    return {
      id: session.user_id,
      username: session.username,
      role: session.role,
      quota_bytes: session.quota_bytes,
      created_at: session.created_at,
      last_login: session.last_login
    };
  }

  static async logout(rawToken: string): Promise<void> {
    if (!rawToken) {
      return; // Already logged out
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const result = db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);

    if (result.changes > 0) {
      // Invalidate session cache
      const { invalidateSessionCache } = require('../utils/cache');
      invalidateSessionCache(tokenHash);
      
      logger.info('User logged out', { tokenHash: tokenHash.substring(0, 8) + '...' });
    }
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get user
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(userId) as User;
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      throw new AppError('INVALID_PASSWORD', 'Current password is incorrect', 400);
    }

    // Validate new password
    if (!newPassword || typeof newPassword !== 'string') {
      throw new ValidationError('New password is required');
    }
    
    if (newPassword.length < 8 || newPassword.length > 128) {
      throw new ValidationError('New password must be 8-128 characters long');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password and delete all other sessions in transaction
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, userId);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    })();

    logger.info('Password changed', { userId, username: user.username });
  }

  static async cleanExpiredSessions(): Promise<{ cleaned: number }> {
    const now = Date.now();
    const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    
    if (result.changes > 0) {
      logger.info('Cleaned expired sessions', { count: result.changes });
    }
    
    return { cleaned: result.changes };
  }

  // Get user count for setup status
  static async getUserCount(): Promise<number> {
    const result = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get() as { count: number };
    return result.count;
  }

  // Create initial admin user during setup
  static async createInitialAdmin(username: string, password: string): Promise<SafeUser> {
    // Check if any users already exist
    const userCount = await this.getUserCount();
    if (userCount > 0) {
      throw new Error('SETUP_ALREADY_COMPLETE');
    }

    // Validate username
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
      throw new ValidationError('Username must be 3-20 characters and contain only letters, numbers, hyphens, and underscores');
    }

    // Validate password
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const now = Date.now();

    const user = {
      id: userId,
      username,
      password_hash: passwordHash,
      role: 'admin' as const,
      quota_bytes: null,
      is_active: 1,
      created_at: now,
      last_login: null
    };

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, quota_bytes, is_active, created_at, last_login)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.username,
      user.password_hash,
      user.role,
      user.quota_bytes,
      user.is_active,
      user.created_at,
      user.last_login
    );

    logger.info('Initial admin user created', { userId, username });

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      quota_bytes: user.quota_bytes,
      created_at: user.created_at,
      last_login: user.last_login
    };
  }
}