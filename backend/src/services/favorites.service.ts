import { db } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface Favorite {
  user_id: string;
  file_id: string | null;
  folder_id: string | null;
  created_at: number;
}

export class FavoritesService {
  // Add a file or folder to favorites
  static addFavorite(userId: string, fileId?: string, folderId?: string): void {
    if (!fileId && !folderId) {
      throw new AppError('INVALID_PARAMS', 'Either fileId or folderId must be provided', 400);
    }

    if (fileId && folderId) {
      throw new AppError('INVALID_PARAMS', 'Cannot favorite both file and folder', 400);
    }

    // Verify file/folder exists and user has access
    if (fileId) {
      const file = db.prepare(`
        SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0
      `).get(fileId, userId);
      
      if (!file) {
        throw new AppError('FILE_NOT_FOUND', 'File not found', 404);
      }
    }

    if (folderId) {
      const folder = db.prepare(`
        SELECT id FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0
      `).get(folderId, userId);
      
      if (!folder) {
        throw new AppError('FOLDER_NOT_FOUND', 'Folder not found', 404);
      }
    }

    const now = Date.now();

    db.prepare(`
      INSERT OR IGNORE INTO favorites (user_id, file_id, folder_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, fileId || null, folderId || null, now);

    logger.info('Added to favorites', { userId, fileId, folderId });
  }

  // Remove from favorites
  static removeFavorite(userId: string, fileId?: string, folderId?: string): void {
    if (!fileId && !folderId) {
      throw new AppError('INVALID_PARAMS', 'Either fileId or folderId must be provided', 400);
    }

    if (fileId) {
      db.prepare(`
        DELETE FROM favorites WHERE user_id = ? AND file_id = ?
      `).run(userId, fileId);
    }

    if (folderId) {
      db.prepare(`
        DELETE FROM favorites WHERE user_id = ? AND folder_id = ?
      `).run(userId, folderId);
    }

    logger.info('Removed from favorites', { userId, fileId, folderId });
  }

  // List all favorites
  static listFavorites(userId: string): { files: any[]; folders: any[] } {
    const files = db.prepare(`
      SELECT f.*, fav.created_at as favorited_at
      FROM favorites fav
      JOIN files f ON fav.file_id = f.id
      WHERE fav.user_id = ? AND fav.file_id IS NOT NULL AND f.is_deleted = 0
      ORDER BY fav.created_at DESC
    `).all(userId);

    const folders = db.prepare(`
      SELECT fo.*, fav.created_at as favorited_at
      FROM favorites fav
      JOIN folders fo ON fav.folder_id = fo.id
      WHERE fav.user_id = ? AND fav.folder_id IS NOT NULL AND fo.is_deleted = 0
      ORDER BY fav.created_at DESC
    `).all(userId);

    return { files, folders };
  }

  // Check if file/folder is favorited
  static isFavorited(userId: string, fileId?: string, folderId?: string): boolean {
    if (fileId) {
      const result = db.prepare(`
        SELECT 1 FROM favorites WHERE user_id = ? AND file_id = ?
      `).get(userId, fileId);
      return !!result;
    }

    if (folderId) {
      const result = db.prepare(`
        SELECT 1 FROM favorites WHERE user_id = ? AND folder_id = ?
      `).get(userId, folderId);
      return !!result;
    }

    return false;
  }
}
