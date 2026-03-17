import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface FileComment {
  id: string;
  file_id: string;
  user_id: string;
  content: string;
  edited: number;
  created_at: number;
  updated_at: number;
  username?: string;
}

export class CommentsService {
  // Add a comment to a file
  static addComment(fileId: string, userId: string, content: string): FileComment {
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new AppError('INVALID_CONTENT', 'Comment content cannot be empty', 400);
    }

    if (content.length > 2000) {
      throw new AppError('CONTENT_TOO_LONG', 'Comment must be 2000 characters or less', 400);
    }

    // Verify file exists and user has access
    const file = db.prepare(`
      SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `).get(fileId, userId);

    if (!file) {
      throw new AppError('FILE_NOT_FOUND', 'File not found or access denied', 404);
    }

    const commentId = uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO file_comments (id, file_id, user_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(commentId, fileId, userId, content.trim(), now, now);

    const comment = db.prepare(`
      SELECT * FROM file_comments WHERE id = ?
    `).get(commentId) as FileComment;

    // Emit WebSocket event
    setImmediate(() => {
      try {
        const { RealtimeService } = require('./realtime.service');
        RealtimeService.sendToUser(userId, 'file:comment', {
          fileId,
          comment
        });
      } catch (err: any) {
        logger.warn('Failed to emit comment event', { error: err.message });
      }
    });

    logger.info('Comment added', { commentId, fileId, userId });
    return comment;
  }

  // Edit a comment
  static editComment(commentId: string, userId: string, content: string): FileComment {
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new AppError('INVALID_CONTENT', 'Comment content cannot be empty', 400);
    }

    if (content.length > 2000) {
      throw new AppError('CONTENT_TOO_LONG', 'Comment must be 2000 characters or less', 400);
    }

    // Verify comment exists and is owned by user
    const comment = db.prepare(`
      SELECT * FROM file_comments WHERE id = ?
    `).get(commentId) as FileComment | undefined;

    if (!comment) {
      throw new AppError('COMMENT_NOT_FOUND', 'Comment not found', 404);
    }

    if (comment.user_id !== userId) {
      throw new AppError('FORBIDDEN', 'You can only edit your own comments', 403);
    }

    const now = Date.now();

    db.prepare(`
      UPDATE file_comments 
      SET content = ?, edited = 1, updated_at = ?
      WHERE id = ?
    `).run(content.trim(), now, commentId);

    const updated = db.prepare(`
      SELECT * FROM file_comments WHERE id = ?
    `).get(commentId) as FileComment;

    logger.info('Comment edited', { commentId, userId });
    return updated;
  }

  // Delete a comment
  static deleteComment(commentId: string, userId: string, isAdmin: boolean = false): void {
    const comment = db.prepare(`
      SELECT * FROM file_comments WHERE id = ?
    `).get(commentId) as FileComment | undefined;

    if (!comment) {
      throw new AppError('COMMENT_NOT_FOUND', 'Comment not found', 404);
    }

    // Only owner or admin can delete
    if (comment.user_id !== userId && !isAdmin) {
      throw new AppError('FORBIDDEN', 'You can only delete your own comments', 403);
    }

    db.prepare(`DELETE FROM file_comments WHERE id = ?`).run(commentId);

    logger.info('Comment deleted', { commentId, userId, isAdmin });
  }

  // List comments for a file
  static listComments(fileId: string, userId: string): FileComment[] {
    // Verify file exists and user has access
    const file = db.prepare(`
      SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `).get(fileId, userId);

    if (!file) {
      throw new AppError('FILE_NOT_FOUND', 'File not found or access denied', 404);
    }

    const comments = db.prepare(`
      SELECT c.*, u.username
      FROM file_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.file_id = ?
      ORDER BY c.created_at ASC
    `).all(fileId) as FileComment[];

    return comments;
  }
}
