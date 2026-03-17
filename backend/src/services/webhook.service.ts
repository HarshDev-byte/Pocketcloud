import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import { Webhook, WebhookDelivery } from '../db/types';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// Valid webhook event types
export const WEBHOOK_EVENTS = [
  'file.created',
  'file.updated',
  'file.deleted',
  'file.downloaded',
  'file.shared',
  'folder.created',
  'folder.deleted',
  'storage.warning',
  'upload.complete',
  'upload.failed',
  'webhook.test'
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export interface WebhookPayload {
  id: string;
  type: WebhookEvent;
  created: number;
  data: any;
}

export interface CreateWebhookParams {
  name: string;
  url: string;
  events: string[];
  secret?: string;
}

export interface WebhookWithSecret extends Webhook {
  secretRevealed?: boolean;
}

const MAX_WEBHOOKS_PER_USER = 10;
const MAX_CONSECUTIVE_FAILURES = 10;
const RETRY_DELAYS = [60000, 300000, 1800000]; // 1min, 5min, 30min

export class WebhookService {
  // Create a new webhook
  static createWebhook(
    userId: string,
    params: CreateWebhookParams
  ): WebhookWithSecret {
    logger.info('Creating webhook', { userId, name: params.name });

    // Validate URL
    if (!params.url.startsWith('http://') && !params.url.startsWith('https://')) {
      throw new AppError(
        'INVALID_URL',
        'Webhook URL must start with http:// or https://',
        400
      );
    }

    // Validate URL format
    try {
      new URL(params.url);
    } catch {
      throw new AppError('INVALID_URL', 'Invalid webhook URL format', 400);
    }

    // Validate events
    for (const event of params.events) {
      if (!WEBHOOK_EVENTS.includes(event as WebhookEvent)) {
        throw new AppError(
          'INVALID_EVENT',
          `Invalid event type: ${event}. Valid events: ${WEBHOOK_EVENTS.join(', ')}`,
          400
        );
      }
    }

    if (params.events.length === 0) {
      throw new AppError(
        'NO_EVENTS',
        'At least one event type must be specified',
        400
      );
    }

    // Check webhook limit
    const count = db.prepare(`
      SELECT COUNT(*) as count FROM webhooks WHERE user_id = ?
    `).get(userId) as { count: number };

    if (count.count >= MAX_WEBHOOKS_PER_USER) {
      throw new AppError(
        'WEBHOOK_LIMIT',
        `Maximum ${MAX_WEBHOOKS_PER_USER} webhooks per user`,
        400
      );
    }

    // Generate secret if not provided
    const secret = params.secret ?? crypto.randomBytes(32).toString('hex');
    const secretRevealed = !params.secret; // Only reveal if auto-generated

    const webhookId = uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO webhooks (id, user_id, name, url, secret, events, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      webhookId,
      userId,
      params.name,
      params.url,
      secret,
      JSON.stringify(params.events),
      now
    );

    const webhook = db.prepare(`
      SELECT * FROM webhooks WHERE id = ?
    `).get(webhookId) as Webhook;

    logger.info('Webhook created', { webhookId, name: params.name });

    return {
      ...webhook,
      secretRevealed
    };
  }

  // Fire an event to all matching webhooks (non-blocking)
  static fireEvent(userId: string, eventType: WebhookEvent, data: any): void {
    // Use setImmediate to make this non-blocking
    setImmediate(async () => {
      try {
        // Find all active webhooks for this user that listen to this event
        const webhooks = db.prepare(`
          SELECT w.* FROM webhooks w, json_each(w.events)
          WHERE w.user_id = ? 
            AND w.is_active = 1 
            AND json_each.value = ?
        `).all(userId, eventType) as Webhook[];

        if (webhooks.length === 0) {
          logger.debug('No webhooks found for event', { userId, eventType });
          return;
        }

        const payload: WebhookPayload = {
          id: uuidv4(),
          type: eventType,
          created: Date.now(),
          data
        };

        logger.info('Firing webhook event', {
          userId,
          eventType,
          webhookCount: webhooks.length
        });

        // Deliver to all matching webhooks
        for (const webhook of webhooks) {
          this.deliverWebhook(webhook, eventType, payload, 0).catch(err => {
            logger.error('Webhook delivery failed', {
              webhookId: webhook.id,
              error: err.message
            });
          });
        }
      } catch (err: any) {
        logger.error('Failed to fire webhook event', {
          userId,
          eventType,
          error: err.message
        });
      }
    });
  }

  // Deliver webhook to endpoint
  private static async deliverWebhook(
    webhook: Webhook,
    eventType: string,
    payload: WebhookPayload,
    retryCount: number
  ): Promise<number> {
    const body = JSON.stringify(payload);
    const signature = 'sha256=' + crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');

    const url = new URL(webhook.url);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        'X-PocketCloud-Event': eventType,
        'X-PocketCloud-Signature': signature,
        'X-PocketCloud-Delivery': payload.id,
        'User-Agent': 'PocketCloud-Webhook/1.0'
      },
      timeout: 10000 // 10 second timeout
    };

    const start = Date.now();
    const deliveryId = uuidv4();

    try {
      const statusCode = await new Promise<number>((resolve, reject) => {
        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(url, options, (res) => {
          let responseBody = '';
          res.on('data', chunk => (responseBody += chunk));
          res.on('end', () => {
            const duration = Date.now() - start;
            const success = res.statusCode! >= 200 && res.statusCode! < 300;

            // Record delivery
            db.prepare(`
              INSERT INTO webhook_deliveries (
                id, webhook_id, event_type, payload, http_status, 
                response, duration_ms, success, delivered_at, retry_count
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              deliveryId,
              webhook.id,
              eventType,
              body,
              res.statusCode,
              responseBody.substring(0, 500),
              duration,
              success ? 1 : 0,
              Date.now(),
              retryCount
            );

            // Update webhook last_fired and status
            db.prepare(`
              UPDATE webhooks 
              SET last_fired = ?, 
                  last_status = ?, 
                  fail_count = CASE WHEN ? = 1 THEN 0 ELSE fail_count + 1 END
              WHERE id = ?
            `).run(Date.now(), res.statusCode, success ? 1 : 0, webhook.id);

            if (success) {
              logger.info('Webhook delivered successfully', {
                webhookId: webhook.id,
                eventType,
                statusCode: res.statusCode,
                duration
              });
            } else {
              logger.warn('Webhook delivery failed', {
                webhookId: webhook.id,
                eventType,
                statusCode: res.statusCode,
                retryCount
              });

              // Retry with exponential backoff
              if (retryCount < 3) {
                const delay = RETRY_DELAYS[retryCount];
                logger.info('Scheduling webhook retry', {
                  webhookId: webhook.id,
                  retryCount: retryCount + 1,
                  delayMs: delay
                });
                setTimeout(() => {
                  this.deliverWebhook(webhook, eventType, payload, retryCount + 1);
                }, delay);
              }

              // Auto-disable after MAX_CONSECUTIVE_FAILURES
              const updated = db.prepare(`
                SELECT fail_count FROM webhooks WHERE id = ?
              `).get(webhook.id) as { fail_count: number } | undefined;

              if (updated && updated.fail_count >= MAX_CONSECUTIVE_FAILURES) {
                db.prepare(`
                  UPDATE webhooks SET is_active = 0 WHERE id = ?
                `).run(webhook.id);
                logger.warn('Webhook auto-disabled after consecutive failures', {
                  webhookId: webhook.id,
                  failCount: updated.fail_count
                });
              }
            }

            resolve(res.statusCode!);
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.on('error', reject);

        req.write(body);
        req.end();
      });

      return statusCode;
    } catch (err: any) {
      const duration = Date.now() - start;

      // Record failed delivery
      db.prepare(`
        INSERT INTO webhook_deliveries (
          id, webhook_id, event_type, payload, http_status, 
          response, duration_ms, success, delivered_at, retry_count
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)
      `).run(
        deliveryId,
        webhook.id,
        eventType,
        body,
        err.message,
        duration,
        Date.now(),
        retryCount
      );

      // Update fail count
      db.prepare(`
        UPDATE webhooks 
        SET fail_count = fail_count + 1 
        WHERE id = ?
      `).run(webhook.id);

      logger.error('Webhook delivery error', {
        webhookId: webhook.id,
        eventType,
        error: err.message,
        retryCount
      });

      // Retry on network errors
      if (retryCount < 3) {
        const delay = RETRY_DELAYS[retryCount];
        setTimeout(() => {
          this.deliverWebhook(webhook, eventType, payload, retryCount + 1);
        }, delay);
      }

      throw err;
    }
  }

  // Test a webhook
  static async testWebhook(webhookId: string, userId: string): Promise<WebhookDelivery> {
    const webhook = db.prepare(`
      SELECT * FROM webhooks WHERE id = ? AND user_id = ?
    `).get(webhookId, userId) as Webhook | undefined;

    if (!webhook) {
      throw new AppError('WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    const payload: WebhookPayload = {
      id: uuidv4(),
      type: 'webhook.test',
      created: Date.now(),
      data: {
        message: 'This is a test event from PocketCloud',
        webhook: {
          id: webhook.id,
          name: webhook.name
        }
      }
    };

    logger.info('Testing webhook', { webhookId, userId });

    // Deliver synchronously for test
    await this.deliverWebhook(webhook, 'webhook.test', payload, 0);

    // Get the delivery record
    const delivery = db.prepare(`
      SELECT * FROM webhook_deliveries 
      WHERE webhook_id = ? AND event_type = 'webhook.test'
      ORDER BY delivered_at DESC 
      LIMIT 1
    `).get(webhookId) as WebhookDelivery;

    return delivery;
  }

  // Get user's webhooks
  static getUserWebhooks(userId: string): Webhook[] {
    const webhooks = db.prepare(`
      SELECT * FROM webhooks 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).all(userId) as Webhook[];

    return webhooks;
  }

  // Get webhook by ID with ownership check
  static getWebhook(webhookId: string, userId: string): Webhook {
    const webhook = db.prepare(`
      SELECT * FROM webhooks WHERE id = ? AND user_id = ?
    `).get(webhookId, userId) as Webhook | undefined;

    if (!webhook) {
      throw new AppError('WEBHOOK_NOT_FOUND', 'Webhook not found', 404);
    }

    return webhook;
  }

  // Update webhook
  static updateWebhook(
    webhookId: string,
    userId: string,
    updates: { name?: string; events?: string[]; is_active?: boolean }
  ): Webhook {
    const webhook = this.getWebhook(webhookId, userId);

    // Validate events if provided
    if (updates.events) {
      for (const event of updates.events) {
        if (!WEBHOOK_EVENTS.includes(event as WebhookEvent)) {
          throw new AppError(
            'INVALID_EVENT',
            `Invalid event type: ${event}`,
            400
          );
        }
      }

      if (updates.events.length === 0) {
        throw new AppError(
          'NO_EVENTS',
          'At least one event type must be specified',
          400
        );
      }
    }

    // Build update query
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.events !== undefined) {
      fields.push('events = ?');
      values.push(JSON.stringify(updates.events));
    }

    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
      // Reset fail count when re-enabling
      if (updates.is_active) {
        fields.push('fail_count = 0');
      }
    }

    if (fields.length === 0) {
      return webhook;
    }

    values.push(webhookId);

    db.prepare(`
      UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);

    logger.info('Webhook updated', { webhookId, updates });

    return this.getWebhook(webhookId, userId);
  }

  // Delete webhook
  static deleteWebhook(webhookId: string, userId: string): void {
    const webhook = this.getWebhook(webhookId, userId);

    db.prepare(`DELETE FROM webhooks WHERE id = ?`).run(webhookId);

    logger.info('Webhook deleted', { webhookId, name: webhook.name });
  }

  // Get webhook deliveries
  static getWebhookDeliveries(
    webhookId: string,
    userId: string,
    limit: number = 50
  ): WebhookDelivery[] {
    // Verify ownership
    this.getWebhook(webhookId, userId);

    const deliveries = db.prepare(`
      SELECT * FROM webhook_deliveries 
      WHERE webhook_id = ? 
      ORDER BY delivered_at DESC 
      LIMIT ?
    `).all(webhookId, limit) as WebhookDelivery[];

    return deliveries;
  }
}
