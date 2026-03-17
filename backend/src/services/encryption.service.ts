import { db } from '../db/client';
import { File as FileRecord, Vault } from '../db/types';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

interface EncryptionParams {
  salt: string;
  iv: string;
}

interface FileEncryptionParams extends EncryptionParams {
  hint?: string;
  fileId: string;
}

interface VaultParams {
  salt: string;
  hint?: string;
}

export class EncryptionService {
  /**
   * Generate fresh encryption parameters for client-side encryption
   * Server only provides random salt and IV - never touches keys or plaintext
   */
  static generateEncryptionParams(): EncryptionParams {
    return {
      salt: crypto.randomBytes(32).toString('hex'), // 64-char hex
      iv: crypto.randomBytes(12).toString('hex')     // 24-char hex (AES-GCM)
    };
  }

  /**
   * Mark an uploaded file as encrypted
   * Called AFTER client uploads the already-encrypted blob
   */
  static async markFileEncrypted(
    fileId: string, 
    userId: string, 
    salt: string, 
    iv: string, 
    hint?: string
  ): Promise<void> {
    // Verify file exists and is owned by user
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Validate encryption parameters
    if (!/^[a-f0-9]{64}$/i.test(salt)) {
      throw new ValidationError('Invalid salt format');
    }
    if (!/^[a-f0-9]{24}$/i.test(iv)) {
      throw new ValidationError('Invalid IV format');
    }

    // Update file with encryption metadata
    db.prepare(`
      UPDATE files SET 
        is_encrypted = 1,
        encryption_salt = ?,
        encryption_iv = ?,
        encryption_hint = ?,
        media_status = 'encrypted'
      WHERE id = ? AND owner_id = ?
    `).run(salt, iv, hint || null, fileId, userId);

    // Remove any pending media processing tasks for encrypted files
    db.prepare('DELETE FROM media_queue WHERE file_id = ?').run(fileId);

    logger.info('File marked as encrypted', {
      fileId,
      userId,
      filename: file.name,
      hasHint: !!hint
    });
  }
  /**
   * Get encryption parameters for a file
   * Returns salt, IV, and hint for client-side decryption
   */
  static async getEncryptionParams(fileId: string, userId: string): Promise<FileEncryptionParams> {
    // Verify file exists and is owned by user
    const file = db.prepare(`
      SELECT id, is_encrypted, encryption_salt, encryption_iv, encryption_hint 
      FROM files 
      WHERE id = ? AND owner_id = ?
    `).get(fileId, userId) as Partial<FileRecord>;

    if (!file) {
      throw new NotFoundError('File not found');
    }

    if (file.is_encrypted !== 1) {
      throw new ValidationError('File is not encrypted');
    }

    if (!file.encryption_salt || !file.encryption_iv) {
      throw new ValidationError('File encryption parameters missing');
    }

    return {
      fileId,
      salt: file.encryption_salt,
      iv: file.encryption_iv,
      hint: file.encryption_hint || undefined
    };
  }

  /**
   * Create an encrypted vault folder
   * Vault folders have their own encryption key derived from a separate password
   */
  static async createVault(
    userId: string, 
    folderId: string, 
    salt: string, 
    hint?: string
  ): Promise<{ vault: Vault; folder: any }> {
    // Verify folder exists and is owned by user
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(folderId, userId) as any;
    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // Check if vault already exists for this folder
    const existingVault = db.prepare('SELECT id FROM vaults WHERE folder_id = ?').get(folderId);
    if (existingVault) {
      throw new ConflictError('Vault already exists for this folder');
    }

    // Validate salt format
    if (!/^[a-f0-9]{64}$/i.test(salt)) {
      throw new ValidationError('Invalid salt format');
    }

    const vaultId = uuidv4();
    const now = Date.now();

    // Create vault and update folder name in transaction
    const vault = db.transaction(() => {
      // Insert vault record
      db.prepare(`
        INSERT INTO vaults (id, owner_id, folder_id, salt, hint, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(vaultId, userId, folderId, salt, hint || null, now);

      // Add lock emoji to folder name as visual indicator
      const newFolderName = `🔒 ${folder.name}`;
      db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(newFolderName, folderId);

      return db.prepare('SELECT * FROM vaults WHERE id = ?').get(vaultId) as Vault;
    })();

    const updatedFolder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId);

    logger.info('Vault created', {
      vaultId,
      folderId,
      userId,
      folderName: folder.name,
      hasHint: !!hint
    });

    return { vault, folder: updatedFolder };
  }

  /**
   * Get vault parameters for folder decryption
   * Returns salt and hint for deriving the vault key
   */
  static async getVaultParams(folderId: string, userId: string): Promise<VaultParams> {
    // Verify folder ownership
    const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?').get(folderId, userId);
    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // Get vault parameters
    const vault = db.prepare('SELECT salt, hint FROM vaults WHERE folder_id = ?').get(folderId) as Partial<Vault>;
    if (!vault) {
      throw new NotFoundError('Vault not found for this folder');
    }

    return {
      salt: vault.salt!,
      hint: vault.hint || undefined
    };
  }

  /**
   * List all vaults owned by a user
   */
  static async listUserVaults(userId: string): Promise<Array<{ vault: Vault; folder: any }>> {
    const vaults = db.prepare(`
      SELECT v.*, f.name as folder_name, f.path as folder_path
      FROM vaults v
      JOIN folders f ON f.id = v.folder_id
      WHERE v.owner_id = ? AND f.is_deleted = 0
      ORDER BY v.created_at DESC
    `).all(userId) as Array<Vault & { folder_name: string; folder_path: string }>;

    return vaults.map(v => ({
      vault: {
        id: v.id,
        owner_id: v.owner_id,
        folder_id: v.folder_id,
        salt: v.salt,
        hint: v.hint,
        created_at: v.created_at
      },
      folder: {
        id: v.folder_id,
        name: v.folder_name,
        path: v.folder_path
      }
    }));
  }

  /**
   * Check if a file is encrypted
   */
  static async isFileEncrypted(fileId: string, userId: string): Promise<boolean> {
    const file = db.prepare(`
      SELECT is_encrypted 
      FROM files 
      WHERE id = ? AND owner_id = ?
    `).get(fileId, userId) as { is_encrypted: number } | undefined;

    return file ? file.is_encrypted === 1 : false;
  }

  /**
   * Check if a folder is a vault
   */
  static async isFolderVault(folderId: string, userId: string): Promise<boolean> {
    const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?').get(folderId, userId);
    if (!folder) {
      return false;
    }

    const vault = db.prepare('SELECT id FROM vaults WHERE folder_id = ?').get(folderId);
    return !!vault;
  }

  /**
   * Get encryption statistics for a user
   */
  static async getEncryptionStats(userId: string): Promise<{
    encryptedFiles: number;
    encryptedSize: number;
    vaultCount: number;
  }> {
    const fileStats = db.prepare(`
      SELECT 
        COUNT(*) as encrypted_files,
        SUM(size) as encrypted_size
      FROM files 
      WHERE owner_id = ? AND is_encrypted = 1 AND is_deleted = 0
    `).get(userId) as { encrypted_files: number; encrypted_size: number };

    const vaultCount = db.prepare(`
      SELECT COUNT(*) as vault_count
      FROM vaults v
      JOIN folders f ON f.id = v.folder_id
      WHERE v.owner_id = ? AND f.is_deleted = 0
    `).get(userId) as { vault_count: number };

    return {
      encryptedFiles: fileStats.encrypted_files || 0,
      encryptedSize: fileStats.encrypted_size || 0,
      vaultCount: vaultCount.vault_count || 0
    };
  }
}