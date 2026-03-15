import { createHmac, randomBytes } from 'crypto';
import { db } from '../db';
import { LoggerService } from './logger.service';
import PQueue from 'p-queue';

export interface WebhookEvent {
  id: string;
  type: string;
  created: number;
  data: any;
}

export interface Webhook {
  id: string;
  user_id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  is_active: number;
  created_at: number;
  last_fired_at?: number;
  last_status?: number;
  fail_count: number;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  status?: number;
  response?: string;
  duration_ms?: number;
  created_at: number;
  delivered_at?: number;
}

/**
 * Webhook service for external integrations and automation
 * Handles event delivery with retry logic and failure handling
 */
export class WebhookService {
  private static deliveryQueue = new PQueue({ 
    concurrency: 3,  // Max 3 concurrent webhook deliveries
    interval: 1000,  // Rate limit: max 3 per second
    intervalCap: 3
  });

  // Supported event types
  public static readonly EVENT_TYPES = {
    // File events
    FILE_CREATED: 'file.created',
    FILE_UPDATED: 'file.updated', 
    FILE_DELETED: 'file.deleted',
    FILE_RESTORED: 'file.restored',
    FILE_DOWNLOADED: 'file.downloaded',
    FILE_SHARED: 'file.shared',
    
    // Folder events
    FOLDER_CREATED: 'folder.created',
    FOLDER_DELETED: 'folder.deleted',
    
    // Upload events
    UPLOAD_STARTED: 'upload.started',
    UPLOAD_COMPLETE: 'upload.complete',
    UPLOAD_FAILED: 'upload.failed',
    
    // System events
    STORAGE_WARNING: 'storage.warning',  // > 80% full
    USER_LOGIN: 'user.login',
    USER_CREATED: 'user.created'  // admin webhooks only
  };

  /**
   * Create a new webhook
   */
  public static createWebhook(
    userId: string,
    name: string,
    url: string,
    events: string[],
    secret?: string
  ): Webhook {
    const webhookId = `wh_${randomBytes(16).toString('hex')}`;
    const webhookSecret = secret || this.generateSecret();
    
    const webhook: Webhook = {
      id: webhookId,
      user_id: userId,
      name,
      url,
      secret: webhookSecret,
      events,
      is_active: 1,
      created_at: Date.now(),
      fail_count: 0
    };

    const stmt = db.prepare(`
      INSERT INTO webhooks (
        id, user_id, name, url, secret, events, 
        is_active, created_at, fail_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      webhook.id,
      webhook.user_id,
      webhook.name,
      webhook.url,
      webhook.secret,
      JSON.stringify(webhook.events),
      webhook.is_active,
      webhook.created_at,
      webhook.fail_count
    );

    LoggerService.info('webhook', `Created webhook: ${name}`, userId, {
      webhookId,
      url,
      events
    });

    return webhook;
  }

  /**
   * Get webhooks for a user
   */
  public static getUserWebhooks(userId: string): Webhook[] {
    const stmt = db.prepare(`
      SELECT * FROM webhooks 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(userId) as any[];
    return rows.map(row => ({
      ...row,
      events: JSON.parse(row.events)
    }));
  }

  /**
   * Get webhook by ID
   */
  public static getWebhook(webhookId: string): Webhook | null {
    const stmt = db.prepare('SELECT * FROM webhooks WHERE id = ?');
    const row = stmt.get(webhookId) as any;
    
    if (!row) return null;
    
    return {
      ...row,
      events: JSON.parse(row.events)
    };
  }

  /**
   * Update webhook
   */
  public static updateWebhook(
    webhookId: string,
    updates: Partial<Pick<Webhook, 'name' | 'url' | 'events' | 'is_active'>>
  ): boolean {
    const webhook = this.getWebhook(webhookId);
    if (!webhook) return false;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.url !== undefined) {
      fields.push('url = ?');
      values.push(updates.url);
    }
    if (updates.events !== undefined) {
      fields.push('events = ?');
      values.push(JSON.stringify(updates.events));
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active);
    }

    if (fields.length === 0) return false;

    values.push(webhookId);
    
    const stmt = db.prepare(`
      UPDATE webhooks 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Delete webhook
   */
  public static deleteWebhook(webhookId: string): boolean {
    const stmt = db.prepare('DELETE FROM webhooks WHERE id = ?');
    const result = stmt.run(webhookId);
    return result.changes > 0;
  }

  /**
   * Fan out event to all matching webhooks for a user
   */
  public static async fanOut(eventType: string, payload: any, userId: string): Promise<void> {
    try {
      // Find all active webhooks for this user that listen to this event
      const stmt = db.prepare(`
        SELECT * FROM webhooks 
        WHERE user_id = ? AND is_active = 1
      `);

      const webhooks = stmt.all(userId) as any[];
      
      const matchingWebhooks = webhooks.filter(webhook => {
        const events = JSON.parse(webhook.events);
        return events.includes(eventType);
      });

      if (matchingWebhooks.length === 0) {
        return;
      }

      // Create event payload
      const event: WebhookEvent = {
        id: `evt_${randomBytes(16).toString('hex')}`,
        type: eventType,
        created: Date.now(),
        data: payload
      };

      // Queue delivery to all matching webhooks (non-blocking)
      for (const webhook of matchingWebhooks) {
        this.deliveryQueue.add(() => this.deliverEvent(webhook.id, event));
      }

      LoggerService.info('webhook', `Fanned out ${eventType} to ${matchingWebhooks.length} webhooks`, userId, {
        eventType,
        webhookCount: matchingWebhooks.length
      });

    } catch (error) {
      LoggerService.error('webhook', `Fan out failed for ${eventType}`, userId, { error });
    }
  }

  /**
   * Deliver event to a specific webhook with retry logic
   */
  public static async deliverEvent(webhookId: string, event: WebhookEvent): Promise<void> {
    const webhook = this.getWebhook(webhookId);
    if (!webhook || !webhook.is_active) {
      return;
    }

    const deliveryId = `del_${randomBytes(16).toString('hex')}`;
    const startTime = Date.now();

    // Create delivery record
    const createDeliveryStmt = db.prepare(`
      INSERT INTO webhook_deliveries (
        id, webhook_id, event_type, payload, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    createDeliveryStmt.run(
      deliveryId,
      webhookId,
      event.type,
      JSON.stringify(event),
      startTime
    );

    try {
      // Sign payload with HMAC-SHA256
      const signature = this.signPayload(JSON.stringify(event), webhook.secret);
      
      // Make HTTP request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PocketCloud-Webhooks/1.0',
          'X-PocketCloud-Signature': `sha256=${signature}`,
          'X-PocketCloud-Event': event.type,
          'X-PocketCloud-Delivery': deliveryId
        },
        body: JSON.stringify(event),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      const responseText = await response.text();
      const truncatedResponse = responseText.substring(0, 500);

      // Update delivery record with success
      const updateStmt = db.prepare(`
        UPDATE webhook_deliveries 
        SET status = ?, response = ?, duration_ms = ?, delivered_at = ?
        WHERE id = ?
      `);

      updateStmt.run(
        response.status,
        truncatedResponse,
        duration,
        Date.now(),
        deliveryId
      );

      // Update webhook last fired status
      const updateWebhookStmt = db.prepare(`
        UPDATE webhooks 
        SET last_fired_at = ?, last_status = ?, fail_count = 0
        WHERE id = ?
      `);

      updateWebhookStmt.run(Date.now(), response.status, webhookId);

      if (response.status >= 200 && response.status < 300) {
        LoggerService.info('webhook', `Delivered ${event.type} successfully`, webhook.user_id, {
          webhookId,
          deliveryId,
          status: response.status,
          duration
        });
      } else {
        LoggerService.warn('webhook', `Webhook returned non-2xx status`, webhook.user_id, {
          webhookId,
          deliveryId,
          status: response.status,
          response: truncatedResponse
        });
        
        await this.handleDeliveryFailure(webhookId, deliveryId, response.status);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update delivery record with failure
      const updateStmt = db.prepare(`
        UPDATE webhook_deliveries 
        SET status = ?, response = ?, duration_ms = ?, delivered_at = ?
        WHERE id = ?
      `);

      updateStmt.run(
        0, // Status 0 for network/timeout errors
        errorMessage.substring(0, 500),
        duration,
        Date.now(),
        deliveryId
      );

      LoggerService.error('webhook', `Webhook delivery failed`, webhook.user_id, {
        webhookId,
        deliveryId,
        error: errorMessage
      });

      await this.handleDeliveryFailure(webhookId, deliveryId, 0);
    }
  }

  /**
   * Handle delivery failure with retry logic
   */
  private static async handleDeliveryFailure(
    webhookId: string, 
    deliveryId: string, 
    status: number
  ): Promise<void> {
    const webhook = this.getWebhook(webhookId);
    if (!webhook) return;

    const newFailCount = webhook.fail_count + 1;

    // Update fail count
    const updateStmt = db.prepare(`
      UPDATE webhooks 
      SET fail_count = ?, last_status = ?
      WHERE id = ?
    `);

    updateStmt.run(newFailCount, status, webhookId);

    // Disable webhook after 3 consecutive failures
    if (newFailCount >= 3) {
      const disableStmt = db.prepare(`
        UPDATE webhooks 
        SET is_active = 0
        WHERE id = ?
      `);

      disableStmt.run(webhookId);

      LoggerService.warn('webhook', `Webhook disabled after 3 failures`, webhook.user_id, {
        webhookId,
        webhookName: webhook.name,
        failCount: newFailCount
      });

      // TODO: Notify admin/user about disabled webhook
      return;
    }

    // Schedule retry with exponential backoff
    const retryDelays = [60000, 300000, 1800000]; // 1min, 5min, 30min
    const retryDelay = retryDelays[newFailCount - 1] || 1800000;

    setTimeout(() => {
      // Get the original event from the delivery record
      const deliveryStmt = db.prepare(`
        SELECT payload FROM webhook_deliveries WHERE id = ?
      `);
      
      const delivery = deliveryStmt.get(deliveryId) as any;
      if (delivery) {
        const event = JSON.parse(delivery.payload);
        this.deliveryQueue.add(() => this.deliverEvent(webhookId, event));
      }
    }, retryDelay);

    LoggerService.info('webhook', `Scheduled retry for webhook`, webhook.user_id, {
      webhookId,
      retryDelay,
      failCount: newFailCount
    });
  }

  /**
   * Send test event to webhook
   */
  public static async testWebhook(webhookId: string): Promise<{ success: boolean; status?: number; error?: string }> {
    const webhook = this.getWebhook(webhookId);
    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    const testEvent: WebhookEvent = {
      id: `evt_test_${randomBytes(8).toString('hex')}`,
      type: 'test.ping',
      created: Date.now(),
      data: {
        message: 'This is a test webhook delivery from Pocket Cloud Drive',
        webhook: {
          id: webhook.id,
          name: webhook.name
        }
      }
    };

    try {
      await this.deliverEvent(webhookId, testEvent);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get delivery history for a webhook
   */
  public static getWebhookDeliveries(
    webhookId: string, 
    limit: number = 50
  ): WebhookDelivery[] {
    const stmt = db.prepare(`
      SELECT * FROM webhook_deliveries 
      WHERE webhook_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);

    return stmt.all(webhookId, limit) as WebhookDelivery[];
  }

  /**
   * Generate secure webhook secret
   */
  private static generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Sign payload with HMAC-SHA256
   */
  private static signPayload(payload: string, secret: string): string {
    return createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  public static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = `sha256=${this.signPayload(payload, secret)}`;
    
    // Use timing-safe comparison
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * Clean up old delivery records (keep last 1000 per webhook)
   */
  public static cleanupDeliveries(): void {
    const stmt = db.prepare(`
      DELETE FROM webhook_deliveries 
      WHERE id NOT IN (
        SELECT id FROM webhook_deliveries 
        WHERE webhook_id = webhook_deliveries.webhook_id 
        ORDER BY created_at DESC 
        LIMIT 1000
      )
    `);

    const result = stmt.run();
    
    if (result.changes > 0) {
      LoggerService.info('webhook', `Cleaned up ${result.changes} old delivery records`);
    }
  }
}