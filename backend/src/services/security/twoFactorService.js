const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../../config/database');

class TwoFactorService {
  /**
   * Generate 2FA secret for user
   */
  generateSecret(username) {
    const secret = speakeasy.generateSecret({
      name: `PocketCloud (${username})`,
      issuer: 'PocketCloud',
      length: 32
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url
    };
  }

  /**
   * Generate QR code for 2FA setup
   */
  async generateQRCode(otpauthUrl) {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
      return qrCodeDataUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Verify TOTP token
   */
  verifyToken(secret, token) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps before/after for clock skew
    });
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Setup 2FA for user
   */
  async setup2FA(userId) {
    try {
      const db = getDatabase();
      
      // Get user info
      const user = db.exec(`SELECT username FROM users WHERE id = ${userId}`)[0];
      if (!user || !user.values.length) {
        throw new Error('User not found');
      }
      
      const username = user.values[0][0];
      
      // Generate secret and backup codes
      const { secret, otpauthUrl } = this.generateSecret(username);
      const backupCodes = this.generateBackupCodes();
      const qrCode = await this.generateQRCode(otpauthUrl);

      // Check if 2FA already exists
      const existing = db.exec(`SELECT id FROM two_factor_auth WHERE user_id = ${userId}`)[0];
      
      if (existing && existing.values.length > 0) {
        // Update existing
        db.run(
          `UPDATE two_factor_auth 
           SET secret = ?, backup_codes = ?, enabled = 0
           WHERE user_id = ?`,
          [secret, JSON.stringify(backupCodes), userId]
        );
      } else {
        // Insert new
        db.run(
          `INSERT INTO two_factor_auth (user_id, secret, backup_codes, enabled)
           VALUES (?, ?, ?, 0)`,
          [userId, secret, JSON.stringify(backupCodes)]
        );
      }

      saveDatabase();

      return {
        secret,
        qrCode,
        backupCodes
      };
    } catch (error) {
      console.error('Error setting up 2FA:', error);
      throw error;
    }
  }

  /**
   * Enable 2FA after verification
   */
  async enable2FA(userId, token) {
    try {
      const db = getDatabase();
      
      // Get secret
      const result = db.exec(
        `SELECT secret FROM two_factor_auth WHERE user_id = ${userId}`
      )[0];
      
      if (!result || !result.values.length) {
        throw new Error('2FA not set up');
      }

      const secret = result.values[0][0];

      // Verify token
      if (!this.verifyToken(secret, token)) {
        throw new Error('Invalid token');
      }

      // Enable 2FA
      db.run(
        `UPDATE two_factor_auth 
         SET enabled = 1, enabled_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [userId]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error enabling 2FA:', error);
      throw error;
    }
  }

  /**
   * Disable 2FA
   */
  async disable2FA(userId, password) {
    try {
      const db = getDatabase();
      
      // Verify password (should be done by caller)
      
      db.run(
        `UPDATE two_factor_auth 
         SET enabled = 0
         WHERE user_id = ?`,
        [userId]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA token for login
   */
  async verify2FA(userId, token) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT secret, backup_codes, enabled 
         FROM two_factor_auth 
         WHERE user_id = ${userId}`
      )[0];
      
      if (!result || !result.values.length) {
        return { valid: false, reason: '2FA not set up' };
      }

      const [secret, backupCodesJson, enabled] = result.values[0];

      if (!enabled) {
        return { valid: false, reason: '2FA not enabled' };
      }

      // Try TOTP verification first
      if (this.verifyToken(secret, token)) {
        return { valid: true, method: 'totp' };
      }

      // Try backup codes
      const backupCodes = JSON.parse(backupCodesJson || '[]');
      const codeIndex = backupCodes.indexOf(token.toUpperCase());
      
      if (codeIndex !== -1) {
        // Remove used backup code
        backupCodes.splice(codeIndex, 1);
        
        db.run(
          `UPDATE two_factor_auth 
           SET backup_codes = ?
           WHERE user_id = ?`,
          [JSON.stringify(backupCodes), userId]
        );
        
        saveDatabase();
        
        return { 
          valid: true, 
          method: 'backup',
          remainingBackupCodes: backupCodes.length
        };
      }

      return { valid: false, reason: 'Invalid token' };
    } catch (error) {
      console.error('Error verifying 2FA:', error);
      throw error;
    }
  }

  /**
   * Check if user has 2FA enabled
   */
  async is2FAEnabled(userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT enabled FROM two_factor_auth WHERE user_id = ${userId}`
      )[0];
      
      if (!result || !result.values.length) {
        return false;
      }

      return result.values[0][0] === 1;
    } catch (error) {
      console.error('Error checking 2FA status:', error);
      return false;
    }
  }

  /**
   * Get backup codes
   */
  async getBackupCodes(userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT backup_codes FROM two_factor_auth WHERE user_id = ${userId}`
      )[0];
      
      if (!result || !result.values.length) {
        throw new Error('2FA not set up');
      }

      const backupCodes = JSON.parse(result.values[0][0] || '[]');
      return backupCodes;
    } catch (error) {
      console.error('Error getting backup codes:', error);
      throw error;
    }
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId) {
    try {
      const db = getDatabase();
      
      const newCodes = this.generateBackupCodes();
      
      db.run(
        `UPDATE two_factor_auth 
         SET backup_codes = ?
         WHERE user_id = ?`,
        [JSON.stringify(newCodes), userId]
      );

      saveDatabase();

      return newCodes;
    } catch (error) {
      console.error('Error regenerating backup codes:', error);
      throw error;
    }
  }
}

module.exports = new TwoFactorService();
