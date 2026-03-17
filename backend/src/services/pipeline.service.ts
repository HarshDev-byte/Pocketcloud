import { db } from '../db/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { FileService } from './file.service';
import * as fs from 'fs';
import * as path from 'path';

interface Condition {
  type: string;
  operator: string;
  value: any;
}

interface Action {
  type: string;
  [key: string]: any;
}

interface PipelineRule {
  id: string;
  user_id: string;
  name: string;
  is_active: number;
  trigger_type: string;
  priority: number;
  conditions: Condition[];
  actions: Action[];
  run_count: number;
  last_run: number | null;
  created_at: number;
}

interface ActionResult {
  action: string;
  success: boolean;
  detail?: string;
}

interface EvaluationResult {
  matches: boolean;
  matchedConditions: string[];
  skippedConditions: string[];
}

export class PipelineService {
  // Evaluate a single condition against a file
  static evaluateCondition(condition: Condition, file: any, context: any): boolean {
    try {
      switch (condition.type) {
        case 'mime_type':
          switch (condition.operator) {
            case 'starts_with':
              return file.mime_type.startsWith(condition.value);
            case 'equals':
              return file.mime_type === condition.value;
            case 'contains':
              return file.mime_type.includes(condition.value);
            default:
              return false;
          }

        case 'filename':
          const name = file.name.toLowerCase();
          const val = String(condition.value).toLowerCase();
          switch (condition.operator) {
            case 'contains':
              return name.includes(val);
            case 'starts_with':
              return name.startsWith(val);
            case 'ends_with':
              return name.endsWith(val);
            case 'equals':
              return name === val;
            case 'regex':
              try {
                return new RegExp(condition.value, 'i').test(file.name);
              } catch {
                return false; // Invalid regex = no match
              }
            default:
              return false;
          }

        case 'file_size':
          switch (condition.operator) {
            case 'greater_than':
              return file.size > condition.value;
            case 'less_than':
              return file.size < condition.value;
            case 'equals':
              return file.size === condition.value;
            default:
              return false;
          }

        case 'folder_path':
          const folderPath = this.getFolderPath(file.folder_id);
          return folderPath.toLowerCase().includes(String(condition.value).toLowerCase());

        case 'upload_hour':
          const hour = new Date().getHours();
          if (condition.operator === 'between' && Array.isArray(condition.value)) {
            const [start, end] = condition.value;
            if (start > end) {
              // Wraps around midnight (e.g., 22-6)
              return hour >= start || hour <= end;
            }
            return hour >= start && hour <= end;
          }
          return false;

        case 'exif_date':
          // Would need EXIF parsing - simplified for now
          if (condition.operator === 'before') {
            const targetDate = new Date(condition.value).getTime();
            return file.created_at < targetDate;
          }
          return false;

        default:
          return false;
      }
    } catch (error: any) {
      logger.warn('Condition evaluation failed', { 
        condition, 
        error: error.message 
      });
      return false;
    }
  }

  // Evaluate all conditions in a rule (AND logic)
  static evaluateRule(rule: PipelineRule, file: any, context: any): boolean {
    return rule.conditions.every(c => this.evaluateCondition(c, file, context));
  }

  // Evaluate rule and return detailed results (for testing)
  static evaluateRuleDetailed(rule: PipelineRule, file: any, context: any): EvaluationResult {
    const matchedConditions: string[] = [];
    const skippedConditions: string[] = [];

    for (const condition of rule.conditions) {
      const matches = this.evaluateCondition(condition, file, context);
      const desc = `${condition.type} ${condition.operator} ${JSON.stringify(condition.value)}`;
      
      if (matches) {
        matchedConditions.push(desc);
      } else {
        skippedConditions.push(desc);
      }
    }

    return {
      matches: skippedConditions.length === 0,
      matchedConditions,
      skippedConditions
    };
  }

  // Execute a single action
  static async executeAction(action: Action, file: any, userId: string): Promise<ActionResult> {
    try {
      switch (action.type) {
        case 'move_to_folder':
          await FileService.moveFile(file.id, userId, action.folderId);
          return { action: 'move_to_folder', success: true, detail: action.folderId };

        case 'copy_to_folder':
          // Copy functionality would need to be implemented in FileService
          return { action: 'copy_to_folder', success: false, detail: 'Not implemented' };

        case 'add_tag':
          const { BulkService } = require('./bulk.service');
          await BulkService.addTagToFile(file.id, action.tagId, userId);
          return { action: 'add_tag', success: true, detail: action.tagId };

        case 'remove_tag':
          const { BulkService: BulkService2 } = require('./bulk.service');
          await BulkService2.removeTagFromFile(file.id, action.tagId, userId);
          return { action: 'remove_tag', success: true, detail: action.tagId };

        case 'rename':
          const newName = this.applyRenameTemplate(action.pattern, file);
          await FileService.renameFile(file.id, userId, newName);
          return { action: 'rename', success: true, detail: newName };

        case 'add_to_favorites':
          const { FavoritesService } = require('./favorites.service');
          await FavoritesService.addFavorite(userId, file.id, 'file');
          return { action: 'add_to_favorites', success: true };

        case 'notify_webhook':
          const { WebhookService } = require('./webhook.service');
          WebhookService.fireEvent(userId, 'pipeline.matched', { 
            file: { id: file.id, name: file.name, size: file.size },
            ruleId: action.ruleId 
          });
          return { action: 'notify_webhook', success: true };

        case 'create_share':
          const { ShareService } = require('./share.service');
          const expiresAt = action.expiresInHours 
            ? Date.now() + (action.expiresInHours * 60 * 60 * 1000)
            : null;
          const share = await ShareService.createShare(userId, {
            fileId: file.id,
            expiresAt
          });
          return { action: 'create_share', success: true, detail: share.token };

        case 'compress_image':
          if (!file.mime_type.startsWith('image/')) {
            return { action: 'compress_image', success: false, detail: 'Not an image' };
          }

          // Check if sharp is available
          try {
            const sharp = require('sharp');
            const compressedPath = file.storage_path + '.compressed.webp';
            const originalSize = file.size;

            await sharp(file.storage_path)
              .webp({ quality: action.quality ?? 80 })
              .toFile(compressedPath);

            // Replace original with compressed
            fs.renameSync(compressedPath, file.storage_path);
            const newSize = fs.statSync(file.storage_path).size;

            // Update database
            db.prepare('UPDATE files SET size = ?, mime_type = ? WHERE id = ?')
              .run(newSize, 'image/webp', file.id);

            return { 
              action: 'compress_image', 
              success: true, 
              detail: `${this.formatBytes(originalSize)} → ${this.formatBytes(newSize)}` 
            };
          } catch (error: any) {
            return { 
              action: 'compress_image', 
              success: false, 
              detail: 'Sharp not available or compression failed' 
            };
          }

        case 'delete':
          // Schedule for deletion (soft delete)
          const { TrashService } = require('./trash.service');
          await TrashService.softDeleteFile(file.id, userId);
          return { action: 'delete', success: true };

        default:
          return { action: action.type, success: false, detail: 'Unknown action type' };
      }
    } catch (error: any) {
      logger.error('Action execution failed', { 
        action: action.type, 
        fileId: file.id, 
        error: error.message 
      });
      return { action: action.type, success: false, detail: error.message };
    }
  }

  // Apply rename template
  static applyRenameTemplate(pattern: string, file: any): string {
    const ext = path.extname(file.name);
    const nameWithoutExt = path.basename(file.name, ext);
    
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const datetime = now.toISOString().replace(/[:.]/g, '-').split('.')[0]; // YYYY-MM-DD_HH-MM-SS
    
    let result = pattern;
    result = result.replace('{name}', nameWithoutExt);
    result = result.replace('{ext}', ext.substring(1)); // Remove leading dot
    result = result.replace('{date}', date);
    result = result.replace('{datetime}', datetime);
    result = result.replace('{size}', String(file.size));
    result = result.replace('{mime}', file.mime_type.split('/')[0]);
    result = result.replace('{exif_date}', 'unknown'); // Would need EXIF parsing
    
    return result;
  }

  // Run all matching rules for a file (non-blocking)
  static runRulesForFile(fileId: string, userId: string, trigger: string = 'upload'): void {
    setImmediate(async () => {
      try {
        let file = await FileService.getFile(fileId, userId);
        
        const rules = db.prepare(`
          SELECT * FROM pipeline_rules
          WHERE user_id = ? AND is_active = 1 AND trigger_type = ?
          ORDER BY priority DESC, created_at ASC
        `).all(userId, trigger) as any[];

        for (const ruleRow of rules) {
          try {
            const rule: PipelineRule = {
              ...ruleRow,
              conditions: JSON.parse(ruleRow.conditions),
              actions: JSON.parse(ruleRow.actions)
            };

            // Evaluate conditions
            if (!this.evaluateRule(rule, file, { trigger })) {
              continue; // Rule doesn't match, skip
            }

            logger.info('Pipeline rule matched', { 
              ruleId: rule.id, 
              ruleName: rule.name, 
              fileId 
            });

            const actionsRun: ActionResult[] = [];
            let ruleStatus: 'success' | 'failed' = 'success';
            let ruleError: string | null = null;

            // Execute actions sequentially
            for (const action of rule.actions) {
              try {
                const result = await this.executeAction(action, file, userId);
                actionsRun.push(result);

                if (!result.success) {
                  ruleStatus = 'failed';
                  ruleError = result.detail || 'Action failed';
                }

                // Re-fetch file after each action (it may have moved/renamed)
                file = await FileService.getFile(fileId, userId);
              } catch (err: any) {
                ruleStatus = 'failed';
                ruleError = err.message;
                logger.error('Pipeline action failed', { 
                  ruleId: rule.id, 
                  action: action.type, 
                  error: err.message 
                });
                actionsRun.push({ 
                  action: action.type, 
                  success: false, 
                  detail: err.message 
                });
                break; // Stop executing actions for this rule on failure
              }
            }

            // Record run
            db.prepare(`
              INSERT INTO pipeline_runs (id, rule_id, file_id, status, actions_run, error, ran_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              uuidv4(),
              rule.id,
              fileId,
              ruleStatus,
              JSON.stringify(actionsRun),
              ruleError,
              Date.now()
            );

            // Update rule stats
            db.prepare(`
              UPDATE pipeline_rules 
              SET run_count = run_count + 1, last_run = ? 
              WHERE id = ?
            `).run(Date.now(), rule.id);

          } catch (error: any) {
            logger.error('Pipeline rule execution failed', { 
              ruleId: ruleRow.id, 
              error: error.message 
            });
          }
        }
      } catch (error: any) {
        logger.error('Pipeline execution failed', { 
          fileId, 
          userId, 
          error: error.message 
        });
      }
    });
  }

  // Get folder path by ID
  private static getFolderPath(folderId: string | null): string {
    if (!folderId) {
      return '/';
    }

    const folder = db.prepare('SELECT path FROM folders WHERE id = ?').get(folderId) as any;
    return folder ? folder.path : '/';
  }

  // Format bytes helper
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // Get available condition types
  static getConditionTypes(): any[] {
    return [
      {
        type: 'mime_type',
        label: 'File Type',
        operators: ['starts_with', 'equals', 'contains'],
        valueType: 'string',
        examples: ['image/', 'application/pdf', 'video/']
      },
      {
        type: 'filename',
        label: 'Filename',
        operators: ['contains', 'starts_with', 'ends_with', 'equals', 'regex'],
        valueType: 'string',
        examples: ['invoice', 'IMG_', '.raw']
      },
      {
        type: 'file_size',
        label: 'File Size',
        operators: ['greater_than', 'less_than', 'equals'],
        valueType: 'number',
        examples: [1073741824, 10240]
      },
      {
        type: 'folder_path',
        label: 'Folder Path',
        operators: ['contains'],
        valueType: 'string',
        examples: ['Camera', 'Documents']
      },
      {
        type: 'upload_hour',
        label: 'Upload Time',
        operators: ['between'],
        valueType: 'array',
        examples: [[22, 6], [9, 17]]
      }
    ];
  }

  // Get available action types
  static getActionTypes(): any[] {
    return [
      {
        type: 'move_to_folder',
        label: 'Move to Folder',
        params: [{ name: 'folderId', type: 'string', required: true }]
      },
      {
        type: 'add_tag',
        label: 'Add Tag',
        params: [{ name: 'tagId', type: 'string', required: true }]
      },
      {
        type: 'remove_tag',
        label: 'Remove Tag',
        params: [{ name: 'tagId', type: 'string', required: true }]
      },
      {
        type: 'rename',
        label: 'Rename File',
        params: [{ name: 'pattern', type: 'string', required: true }],
        examples: ['{date}_{name}.{ext}', '{exif_date}_{name}.{ext}']
      },
      {
        type: 'add_to_favorites',
        label: 'Add to Favorites',
        params: []
      },
      {
        type: 'notify_webhook',
        label: 'Notify Webhook',
        params: [{ name: 'webhookId', type: 'string', required: false }]
      },
      {
        type: 'create_share',
        label: 'Create Share Link',
        params: [{ name: 'expiresInHours', type: 'number', required: false }]
      },
      {
        type: 'compress_image',
        label: 'Compress Image',
        params: [{ name: 'quality', type: 'number', required: false, default: 80 }]
      },
      {
        type: 'delete',
        label: 'Delete File',
        params: []
      }
    ];
  }
}
