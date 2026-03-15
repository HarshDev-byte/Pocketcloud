import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { WebhookService } from '../services/webhook.service';
import { LoggerService } from '../services/logger.service';

const router = Router();

// Validation schemas
const createWebhookSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name too long'),
  url: z.string()
    .url('Invalid URL')
    .refine(url => {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    }, 'Only HTTP/HTTPS URLs allowed'),
  events: z.array(z.string())
    .min(1, 'At least one event type required')
    .refine(events => {
      const validEvents = Object.values(WebhookService.EVENT_TYPES);
      return events.every(event => validEvents.includes(event));
    }, 'Invalid event type'),
  secret: z.string().optional()
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  is_active: z.boolean().optional()
});

/**
 * GET /api/developer/webhooks - List user's webhooks
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const webhooks = WebhookService.getUserWebhooks(req.user!.id);
    
    // Don't expose secrets in the response
    const safeWebhooks = webhooks.map(webhook => ({
      ...webhook,
      secret: undefined,
      secretPreview: webhook.secret.substring(0, 8) + '...'
    }));

    res.json({
      success: true,
      data: safeWebhooks,
      meta: {
        requestId: `req_${Date.now()}`,
        timestamp: Date.now(),
        version: '1.0'
      }
    });

  } catch (error) {
    LoggerService.error('webhook', 'Failed to list webhooks', req.user?.id, { error });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve webhooks'
      }
    });
  }
});

/**
 * POST /api/developer/webhooks - Create new webhook
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const validation = createWebhookSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid webhook data',
          details: validation.error.errors
        }
      });
    }

    const { name, url, events, secret } = validation.data;

    // Check if user already has a webhook with this name
    const existingWebhooks = WebhookService.getUserWebhooks(req.user!.id);
    if (existingWebhooks.some(wh => wh.name === name)) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Webhook with this name already exists'
        }
      });
    }

    const webhook = WebhookService.createWebhook(
      req.user!.id,
      name,
      url,
      events,
      secret
    );

    res.status(201).json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret, // Only returned on creation
        secretPreview: webhook.secret.substring(0, 8) + '...',
        is_active: webhook.is_active,
        created_at: webhook.created_at
      },
      meta: {
        requestId: `req_${Date.now()}`,
        timestamp: Date.now(),
        version: '1.0'
      }
    });

  } catch (error) {
    LoggerService.error('webhook', 'Failed to create webhook', req.user?.id, { error });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create webhook'
      }
    });
  }
});

/**
 * PATCH /api/developer/webhooks/:id - Update webhook
 */
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const webhookId = req.params.id;
    
    // Verify webhook belongs to user
    const webhook = WebhookService.getWebhook(webhookId);
    if (!webhook || webhook.user_id !== req.user!.id) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        }
      });
    }

    const validation = updateWebhookSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid update data',
          details: validation.error.errors
        }
      });
    }

    const updates = validation.data;
    
    // Convert boolean to integer for is_active
    const updateData: Partial<Pick<Webhook, 'name' | 'url' | 'events' | 'is_active'>> = {
      ...updates
    };
    
    if (updates.is_active !== undefined) {
      updateData.is_active = updates.is_active ? 1 : 0;
    }

    const success = WebhookService.updateWebhook(webhookId, updateData);
    
    if (!success) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to update webhook'
        }
      });
    }

    // Return updated webhook
    const updatedWebhook = WebhookService.getWebhook(webhookId)!;
    
    res.json({
      success: true,
      data: {
        ...updatedWebhook,
        secret: undefined,
        secretPreview: updatedWebhook.secret.substring(0, 8) + '...'
      },
      meta: {
        requestId: `req_${Date.now()}`,
        timestamp: Date.now(),
        version: '1.0'
      }
    });

  } catch (error) {
    LoggerService.error('webhook', 'Failed to update webhook', req.user?.id, { error });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update webhook'
      }
    });
  }
});

/**
 * DELETE /api/developer/webhooks/:id - Delete webhook
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const webhookId = req.params.id;
    
    // Verify webhook belongs to user
    const webhook = WebhookService.getWebhook(webhookId);
    if (!webhook || webhook.user_id !== req.user!.id) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        }
      });
    }

    const success = WebhookService.deleteWebhook(webhookId);
    
    if (!success) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to delete webhook'
        }
      });
    }

    res.json({
      success: true,
      data: { deleted: true },
      meta: {
        requestId: `req_${Date.now()}`,
        timestamp: Date.now(),
        version: '1.0'
      }
    });

  } catch (error) {
    LoggerService.error('webhook', 'Failed to delete webhook', req.user?.id, { error });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to delete webhook'
      }
    });
  }
});

/**
 * POST /api/developer/webhooks/:id/test - Send test payload
 */
router.post('/:id/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const webhookId = req.params.id;
    
    // Verify webhook belongs to user
    const webhook = WebhookService.getWebhook(webhookId);
    if (!webhook || webhook.user_id !== req.user!.id) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        }
      });
    }

    const result = await WebhookService.testWebhook(webhookId);
    
    if (result.success) {
      res.json({
        success: true,
        data: { 
          message: 'Test webhook sent successfully',
          status: result.status 
        },
        meta: {
          requestId: `req_${Date.now()}`,
          timestamp: Date.now(),
          version: '1.0'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: 'WEBHOOK_TEST_FAILED',
          message: result.error || 'Test webhook failed'
        }
      });
    }

  } catch (error) {
    LoggerService.error('webhook', 'Failed to test webhook', req.user?.id, { error });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to test webhook'
      }
    });
  }
});

/**
 * GET /api/developer/webhooks/:id/deliveries - Get delivery history
 */
router.get('/:id/deliveries', requireAuth, async (req: Request, res: Response) => {
  try {
    const webhookId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    // Verify webhook belongs to user
    const webhook = WebhookService.getWebhook(webhookId);
    if (!webhook || webhook.user_id !== req.user!.id) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook not found'
        }
      });
    }

    const deliveries = WebhookService.getWebhookDeliveries(webhookId, limit);
    
    res.json({
      success: true,
      data: deliveries,
      meta: {
        requestId: `req_${Date.now()}`,
        timestamp: Date.now(),
        version: '1.0',
        pagination: {
          limit,
          count: deliveries.length
        }
      }
    });

  } catch (error) {
    LoggerService.error('webhook', 'Failed to get deliveries', req.user?.id, { error });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve deliveries'
      }
    });
  }
});

/**
 * GET /api/developer/webhooks/events - Get available event types
 */
router.get('/events', requireAuth, async (req: Request, res: Response) => {
  try {
    const eventTypes = Object.entries(WebhookService.EVENT_TYPES).map(([key, value]) => ({
      type: value,
      name: key.toLowerCase().replace(/_/g, ' '),
      description: getEventDescription(value)
    }));

    res.json({
      success: true,
      data: eventTypes,
      meta: {
        requestId: `req_${Date.now()}`,
        timestamp: Date.now(),
        version: '1.0'
      }
    });

  } catch (error) {
    LoggerService.error('webhook', 'Failed to get event types', req.user?.id, { error });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve event types'
      }
    });
  }
});

/**
 * Get human-readable description for event types
 */
function getEventDescription(eventType: string): string {
  const descriptions: Record<string, string> = {
    'file.created': 'Triggered when a new file is uploaded',
    'file.updated': 'Triggered when a file is modified or replaced',
    'file.deleted': 'Triggered when a file is moved to trash',
    'file.restored': 'Triggered when a file is restored from trash',
    'file.downloaded': 'Triggered when a file is downloaded',
    'file.shared': 'Triggered when a file share is created',
    'folder.created': 'Triggered when a new folder is created',
    'folder.deleted': 'Triggered when a folder is deleted',
    'upload.started': 'Triggered when a file upload begins',
    'upload.complete': 'Triggered when a file upload completes successfully',
    'upload.failed': 'Triggered when a file upload fails',
    'storage.warning': 'Triggered when storage usage exceeds 80%',
    'user.login': 'Triggered when a user logs in',
    'user.created': 'Triggered when a new user is created (admin only)'
  };

  return descriptions[eventType] || 'Unknown event type';
}

export default router;