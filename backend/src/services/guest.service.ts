import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface GuestAccount {
  id: string;
  username: string;
  is_guest: number;
  guest_expires_at: number | null;
  created_by: string;
  created_at: number;
}

export class GuestService {
  // Create a guest account
  static createGuestAccount(
    adminUserId: string,
    guestName: string,
    expiresInDays?: number
  ): { user: GuestAccount; temporaryPassword: string } {
    // Generate temporary password
    const temporaryPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = bcrypt.hashSync(temporaryPassword, 12);

    const guestId = uuidv4();
    const now = Date.now();
    const expiresAt = expiresInDays ? now + (expiresInDays * 24 * 60 * 60 * 1000) : null;

    // Create guest user
    db.prepare(`
      INSERT INTO users (
        id, username, password_hash, role, is_active, is_guest, 
        guest_expires_at, created_by, created_at, last_login
      ) VALUES (?, ?, ?, 'user', 1, 1, ?, ?, ?, NULL)
    `).run(guestId, guestName, passwordHash, expiresAt, adminUserId, now);

    const guest = db.prepare(`
      SELECT id, username, is_guest, guest_expires_at, created_by, created_at
      FROM users WHERE id = ?
    `).get(guestId) as GuestAccount;

    logger.info('Guest account created', { 
      guestId, 
      guestName, 
      adminUserId, 
      expiresInDays 
    });

    return {
      user: guest,
      temporaryPassword
    };
  }

  // List all guest accounts
  static listGuestAccounts(): GuestAccount[] {
    const guests = db.prepare(`
      SELECT id, username, is_guest, guest_expires_at, created_by, created_at
      FROM users 
      WHERE is_guest = 1
      ORDER BY created_at DESC
    `).all() as GuestAccount[];

    return guests;
  }

  // Remove guest account
  static removeGuestAccount(guestId: string): void {
    const guest = db.prepare(`
      SELECT id FROM users WHERE id = ? AND is_guest = 1
    `).get(guestId);

    if (!guest) {
      throw new AppError('GUEST_NOT_FOUND', 'Guest account not found', 404);
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(guestId);

    logger.info('Guest account removed', { guestId });
  }

  // Check if guest account is expired
  static isGuestExpired(user: any): boolean {
    if (!user.is_guest) {
      return false;
    }

    if (!user.guest_expires_at) {
      return false; // Permanent guest
    }

    return user.guest_expires_at < Date.now();
  }
}
