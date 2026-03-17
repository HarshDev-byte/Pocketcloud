import { Router, Request, Response } from 'express';
import { WebhookService, WEBHOOK_EVENTS } from '../services/webhook.service';
import { requireAuth } from '../middleware/auth.middleware';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/webhooks - List all webhooks (without secrets)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const webhooks = WebhookService.getUserWebhooks(userId);

    // Remove secrets from response
    const sanitized = webhooks.map(w => {
      const { secret, ...rest } = w;
      return {
        ...rest,
        events: JSON.parse(rest.events)
      };
    });

    res.json({ webhooks: sanitized });
  } catch (err: any) {
    logger.error('Failed to list webhooks', { error: err.message });
    res.status(500).json({
      error: 'LIST_FAILED',
      message: 'Failed to list webhooks'
    });
  }
});

// GET /api/webhooks/events - List available event types
router.get('/events', (req: Request, res: Response) => {
  res.json({ events: WEBHOOK_EVENTS });
});

// POST /api/webhooks - Create a new webhook
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, url, events, secret } = req.body;
    const userId = req.user!.id;

    if (!name || !url || !events) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'name, url, and events are required'
      });
      return;
    }

    if (!Array.isArray(events)) {
      res.status(400).json({
        error: 'INVALID_EVENTS',
        message: 'events must be an array'
      });
      return;
    }

    const webhook = WebhookService.createWebhook(userId, {
      name,
      url,
      events,
      secret
    });

    // Return webhook with secret if it was auto-generated
    const response: any = {
      ...webhook,
      events: JSON.parse(webhook.events)
    };

    // Only include secret in response if it was auto-generated
    if (!webhook.secretRevealed) {
      delete response.secret;
    }

    res.status(201).json({ webhook: response });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to create webhook', { error: err.message });
      res.status(500).json({
        error: 'CREATE_FAILED',
        message: 'Failed to create webhook'
      });
    }
  }
});

// GET /api/webhooks/:id - Get webhook details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const webhook = WebhookService.getWebhook(id, userId);

    // Remove secret from response
    const { secret, ...rest } = webhook;
    const response = {
      ...rest,
      events: JSON.parse(rest.events)
    };

    res.json({ webhook: response });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to get webhook', { error: err.message });
      res.status(500).json({
        error: 'GET_FAILED',
        message: 'Failed to get webhook'
      });
    }
  }
});

// PATCH /api/webhooks/:id - Update webhook
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, events, is_active } = req.body;
    const userId = req.user!.id;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (events !== undefined) updates.events = events;
    if (is_active !== undefined) updates.is_active = is_active;

    const webhook = WebhookService.updateWebhook(id, userId, updates);

    // Remove secret from response
    const { secret, ...rest } = webhook;
    const response = {
      ...rest,
      events: JSON.parse(rest.events)
    };

    res.json({ webhook: response });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to update webhook', { error: err.message });
      res.status(500).json({
        error: 'UPDATE_FAILED',
        message: 'Failed to update webhook'
      });
    }
  }
});

// DELETE /api/webhooks/:id - Delete webhook
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    WebhookService.deleteWebhook(id, userId);

    res.json({
      success: true,
      message: 'Webhook deleted successfully'
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to delete webhook', { error: err.message });
      res.status(500).json({
        error: 'DELETE_FAILED',
        message: 'Failed to delete webhook'
      });
    }
  }
});

// POST /api/webhooks/:id/test - Send test event
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const delivery = await WebhookService.testWebhook(id, userId);

    res.json({
      success: delivery.success === 1,
      delivery: {
        ...delivery,
        payload: JSON.parse(delivery.payload)
      }
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to test webhook', { error: err.message });
      res.status(500).json({
        error: 'TEST_FAILED',
        message: 'Failed to test webhook'
      });
    }
  }
});

// GET /api/webhooks/:id/deliveries - Get delivery logs
router.get('/:id/deliveries', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const deliveries = WebhookService.getWebhookDeliveries(id, userId, limit);

    // Parse payloads
    const parsed = deliveries.map(d => ({
      ...d,
      payload: JSON.parse(d.payload)
    }));

    res.json({ deliveries: parsed });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to get deliveries', { error: err.message });
      res.status(500).json({
        error: 'DELIVERIES_FAILED',
        message: 'Failed to get webhook deliveries'
      });
    }
  }
});

export default router;
    