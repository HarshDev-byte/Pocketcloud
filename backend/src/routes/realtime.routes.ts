import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { RealtimeService, WS_EVENTS } from '../services/realtime.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/realtime/status
 * Get current WebSocket connection statistics (admin only)
 */
router.get('/status', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const stats = RealtimeService.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Failed to get realtime status', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get realtime status'
      }
    });
  }
});

/**
 * POST /api/realtime/broadcast
 * Broadcast custom message to all connected users (admin only)
 */
router.post('/broadcast', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const { event, data, excludeUserId } = req.body;
    
    // Validate event name
    if (!event || typeof event !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EVENT',
          message: 'Event name is required and must be a string'
        }
      });
    }
    
    // Validate data
    if (data !== undefined && typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATA',
          message: 'Data must be an object if provided'
        }
      });
    }
    
    // Broadcast the message
    RealtimeService.broadcast(event as any, data || {}, excludeUserId);
    
    logger.info('Admin broadcast sent', {
      adminId: req.user!.id,
      event,
      excludeUserId,
      dataKeys: data ? Object.keys(data) : []
    });
    
    res.json({
      success: true,
      message: 'Broadcast sent successfully'
    });
    
  } catch (error: any) {
    logger.error('Failed to send broadcast', { 
      adminId: req.user!.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'BROADCAST_FAILED',
        message: 'Failed to send broadcast'
      }
    });
  }
});

/**
 * POST /api/realtime/notify-user
 * Send notification to specific user (admin only)
 */
router.post('/notify-user', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const { userId, event, data } = req.body;
    
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'User ID is required and must be a string'
        }
      });
    }
    
    // Validate event name
    if (!event || typeof event !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EVENT',
          message: 'Event name is required and must be a string'
        }
      });
    }
    
    // Send to specific user
    RealtimeService.sendToUser(userId, event as any, data || {});
    
    logger.info('Admin notification sent to user', {
      adminId: req.user!.id,
      targetUserId: userId,
      event,
      dataKeys: data ? Object.keys(data) : []
    });
    
    res.json({
      success: true,
      message: 'Notification sent successfully'
    });
    
  } catch (error: any) {
    logger.error('Failed to send user notification', { 
      adminId: req.user!.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'NOTIFICATION_FAILED',
        message: 'Failed to send notification'
      }
    });
  }
});

/**
 * POST /api/realtime/system-announcement
 * Send system announcement to all users (admin only)
 */
router.post('/system-announcement', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const { message, type = 'info', persistent = false } = req.body;
    
    // Validate message
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Message is required and must be a string'
        }
      });
    }
    
    // Validate type
    const validTypes = ['info', 'warning', 'error', 'success'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TYPE',
          message: 'Type must be one of: info, warning, error, success'
        }
      });
    }
    
    // Send system announcement
    RealtimeService.broadcast('system:announcement' as any, {
      message,
      type,
      persistent,
      timestamp: Date.now(),
      adminId: req.user!.id
    });
    
    logger.info('System announcement sent', {
      adminId: req.user!.id,
      message,
      type,
      persistent
    });
    
    res.json({
      success: true,
      message: 'System announcement sent successfully'
    });
    
  } catch (error: any) {
    logger.error('Failed to send system announcement', { 
      adminId: req.user!.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'ANNOUNCEMENT_FAILED',
        message: 'Failed to send system announcement'
      }
    });
  }
});

export default router;