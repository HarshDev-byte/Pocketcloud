import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface TotpSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class TotpService {
  // Generate 2FA setup
  static async generateSetup(userId: string): Promise<TotpSetup> {
    const user = db.prepare(`
      SELECT id, username FROM users WHERE id = ?
    `).get(userId) as any;

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Generate TOTP secret
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'PocketCloud',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret
    });

    // Generate QR code
    const otpauthUrl = totp.toString();
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    // Generate 8 backup codes
    const backupCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
    }

    logger.info('2FA setup generated', { userId });

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes
    };
  }

  // Verify and enable 2FA
  static verifyAndEnable(userId: string, token: string, secret: string): boolean {
    // Verify token
    const totp = new OTPAuth.TOTP({
      issuer: 'PocketCloud',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret)
    });

    const delta = totp.validate({ token, window: 1 });
    
    if (delta === null) {
      logger.warn('2FA verification failed', { userId });
      return false;
    }

    // Token is valid - enable 2FA
    logger.info('2FA enabled', { userId });
    return true;
  }

  // Save 2FA configuration
  static saveConfig(userId: string, secret: string, backupCodes: string[]): void {
    // Hash backup codes
    const hashedCodes = backupCodes.map(code => 
      bcrypt.hashSync(code, 10)
    );

    db.prepare(`
      UPDATE users 
      SET totp_secret = ?, 
          totp_enabled = 1, 
          totp_backup_codes = ?
      WHERE id = ?
    `).run(secret, JSON.stringify(hashedCodes), userId);

    logger.info('2FA config saved', { userId });
  }

  // Verify TOTP token
  static verifyTotp(userId: string, token: string): boolean {
    const user = db.prepare(`
      SELECT totp_secret, totp_backup_codes FROM users WHERE id = ? AND totp_enabled = 1
    `).get(userId) as any;

    if (!user || !user.totp_secret) {
      throw new AppError('2FA_NOT_ENABLED', '2FA is not enabled', 400);
    }

    // Check if it's a backup code (8 characters)
    if (token.length === 8) {
      return this.verifyBackupCode(userId, token, user.totp_backup_codes);
    }

    // Verify TOTP token
    const totp = new OTPAuth.TOTP({
      issuer: 'PocketCloud',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totp_secret)
    });

    const delta = totp.validate({ token, window: 1 });
    
    if (delta === null) {
      logger.warn('TOTP verification failed', { userId });
      return false;
    }

    logger.info('TOTP verified', { userId });
    return true;
  }

  // Verify backup code
  private static verifyBackupCode(userId: string, code: string, hashedCodesJson: string): boolean {
    const hashedCodes = JSON.parse(hashedCodesJson || '[]');
    
    for (let i = 0; i < hashedCodes.length; i++) {
      if (bcrypt.compareSync(code, hashedCodes[i])) {
        // Remove used backup code
        hashedCodes.splice(i, 1);
        
        db.prepare(`
          UPDATE users SET totp_backup_codes = ? WHERE id = ?
        `).run(JSON.stringify(hashedCodes), userId);

        logger.info('Backup code used', { userId, remaining: hashedCodes.length });
        return true;
      }
    }

    logger.warn('Invalid backup code', { userId });
    return false;
  }

  // Disable 2FA
  static disable2fa(userId: string, password: string): void {
    // Verify password
    const user = db.prepare(`
      SELECT password_hash FROM users WHERE id = ?
    `).get(userId) as any;

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      throw new AppError('INVALID_PASSWORD', 'Invalid password', 401);
    }

    // Disable 2FA
    db.prepare(`
      UPDATE users 
      SET totp_secret = NULL, 
          totp_enabled = 0, 
          totp_backup_codes = NULL
      WHERE id = ?
    `).run(userId);

    logger.info('2FA disabled', { userId });
  }
}
