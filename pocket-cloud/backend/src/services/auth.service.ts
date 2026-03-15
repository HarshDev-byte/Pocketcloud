/**
 * Authentication service
 * Handles user authentication, session management, and security
 */

import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { User } from '../db/types.js';
import { getDatabase } from '../db/client.js';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface SafeUser {
  id: number;
  username: string;
  email: string | null;
  role: 'admin' | 'user';
  storage_quota: number | null;
  storage_used: number;
  is_active: number;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface LoginMeta {
  ip: string;
  userAgent: string;
}

export class AuthService {
  /**
   * Hash password using bcrypt with cost 12
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  /**
   * Verify password against hash using constant-time comparison
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate secure session token
   */
  generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash session token for database storage
   */
  hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Constant-time comparison to prevent timing attacks
   */
  timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Convert User to SafeUser (without password_hash)
   */
  toSafeUser(user: User): SafeUser {
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Login user with username and password
   */
  async login(username: string, password: string, meta: LoginMeta): Promise<{ token: string; user: SafeUser }> {
    const db = getDatabase();
    
    // Find user by username (case-insensitive)
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND is_active = 1');
    const user = stmt.get(username) as User | undefined;

    // Use same error message for wrong user AND wrong password
    if (!user) {
      throw new AuthError('Invalid credentials');
    }

    // Verify password with bcrypt
    const isValidPassword = await this.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new AuthError('Invalid credentials');
    }

    // Generate session token
    const token = this.generateSessionToken();
    const tokenHash = this.hashSessionToken(token);
    
    // Create session (expires in 7 days)
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
    
    const insertSession = db.prepare(`
      INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertSession.run(user.id, tokenHash, expiresAt, meta.ip, meta.userAgent, Date.now());

    // Update last login
    const updateLogin = db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?');
    updateLogin.run(Date.now(), user.id);

    return {
      token,
      user: this.toSafeUser(user)
    };
  }

  /**
   * Logout user by deleting session
   */
  async logout(tokenHash: string): Promise<void> {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
    stmt.run(tokenHash);
  }

  /**
   * Validate session and return user
   */
  async validateSession(rawToken: string): Promise<SafeUser> {
    const db = getDatabase();
    const tokenHash = this.hashSessionToken(rawToken);
    
    // Find session and user
    const stmt = db.prepare(`
      SELECT s.*, u.* FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
    `);
    const row = stmt.get(tokenHash, Date.now()) as any;

    if (!row) {
      throw new AuthError('Invalid or expired session');
    }

    const user: User = {
      id: row.user_id,
      username: row.username,
      email: row.email,
      password_hash: row.password_hash,
      role: row.role,
      storage_quota: row.storage_quota,
      storage_used: row.storage_used,
      is_active: row.is_active,
      last_login_at: row.last_login_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    };

    // Update last activity (async, don't await)
    setTimeout(() => {
      try {
        const updateActivity = db.prepare('UPDATE sessions SET created_at = ? WHERE token_hash = ?');
        updateActivity.run(Date.now(), tokenHash);
      } catch (error) {
        // Ignore errors for activity update
      }
    }, 0);

    return this.toSafeUser(user);
  }

  /**
   * Change user password
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const db = getDatabase();
    
    // Get current user
    const getUserStmt = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');
    const user = getUserStmt.get(userId) as User | undefined;

    if (!user) {
      throw new AuthError('User not found');
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      throw new AuthError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(newPassword);
    
    // Update password
    const updatePasswordStmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?');
    updatePasswordStmt.run(newPasswordHash, Date.now(), userId);

    // Invalidate all other sessions for this user (keep current session)
    const deleteSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
    deleteSessionsStmt.run(userId);
  }

  /**
   * Create new user (admin only)
   */
  async createUser(username: string, password: string, role: 'admin' | 'user' = 'user'): Promise<SafeUser> {
    const db = getDatabase();
    
    // Validate username: 3-32 chars, alphanumeric + underscore
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      throw new AuthError('Username must be 3-32 characters, alphanumeric and underscore only');
    }

    // Validate password: 8-128 chars
    if (password.length < 8 || password.length > 128) {
      throw new AuthError('Password must be 8-128 characters');
    }

    // Check if username already exists
    const checkUserStmt = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
    const existingUser = checkUserStmt.get(username);

    if (existingUser) {
      throw new AuthError('Username already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);
    
    // Insert user
    const now = Date.now();
    const insertUserStmt = db.prepare(`
      INSERT INTO users (username, password_hash, role, storage_quota, storage_used, is_active, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 0, 1, ?, ?)
    `);
    const result = insertUserStmt.run(username, passwordHash, role, now, now);

    // Return created user
    const getUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = getUserStmt.get(result.lastInsertRowid) as User;

    return this.toSafeUser(user);
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username: string): Promise<User | null> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
    const user = stmt.get(username) as User | undefined;
    return user || null;
  }

  /**
   * Find user by ID
   */
  async findUserById(id: number): Promise<User | null> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id) as User | undefined;
    return user || null;
  }
}