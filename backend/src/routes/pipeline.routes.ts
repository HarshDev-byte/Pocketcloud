import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { PipelineService } from '../services/pipeline.service';
import { FileService } from '../services/file.service';
import { db } from '../db/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

const router = Router();

// Get all rules for current user
router.get('/rules', requireAuth, async (req: Request, res: Response) => {
  try {
    const rules = db.prepare(`
      SELECT * FROM pipeline_rules
      WHERE user_id = ?
      ORDER BY priority DESC, created_at DESC
    `).all(req.user!.id) as any[];

    const formatted = rules.map(r => ({
      ...r,
      conditions: JSON.parse(r.conditions),
      actions: JSON.parse(r.actions),
      isActive: r.is_active === 1
    }));

    res.json({ rules: formatted });
  } catch (error: any) {
    logger.error('Failed to get pipeline rules', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Create new rule
router.post('/rules', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, conditions, actions, triggerType, priority } = req.body;

    // Validation
    if (!name || !conditions || !actions || !triggerType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!Array.isArray(conditions) || conditions.length === 0 || conditions.length > 10) {
      return res.status(400).json({ error: 'Conditions must be array of 1-10 items' });
    }

    if (!Array.isArray(actions) || actions.length === 0 || actions.length > 5) {
      return res.status(400).json({ error: 'Actions must be array of 1-5 items' });
    }

    if (!['upload', 'schedule', 'manual'].includes(triggerType)) {
      return res.status(400).json({ error: 'Invalid trigger type' });
    }

    // Check rule limit (10 per user)
    const ruleCount = db.prepare('SELECT COUNT(*) as count FROM pipeline_rules WHERE user_id = ?')
      .get(req.user!.id) as any;
    
    if (ruleCount.count >= 10) {
      return res.status(400).json({ error: 'Maximum 10 rules per user' });
    }

    // Validate condition types
    const validConditionTypes = ['mime_type', 'filename', 'file_size', 'folder_path', 'upload_hour', 'exif_date'];
    for (const condition of conditions) {
      if (!validConditionTypes.includes(condition.type)) {
        return res.status(400).json({ error: `Invalid condition type: ${condition.type}` });
      }
      if (!condition.operator || condition.value === undefined) {
        return res.status(400).json({ error: 'Condition must have operator and value' });
      }
    }

    // Validate action types
    const validActionTypes = [
      'move_to_folder', 'copy_to_folder', 'add_tag', 'remove_tag', 
      'rename', 'add_to_favorites', 'notify_webhook', 'create_share', 
      'compress_image', 'delete'
    ];
    for (const action of actions) {
      if (!validActionTypes.includes(action.type)) {
        return res.status(400).json({ error: `Invalid action type: ${action.type}` });
      }
    }

    // Create rule
    const ruleId = uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO pipeline_rules (
        id, user_id, name, is_active, trigger_type, priority,
        conditions, actions, run_count, last_run, created_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 0, NULL, ?)
    `).run(
      ruleId,
      req.user!.id,
      name,
      triggerType,
      priority || 0,
      JSON.stringify(conditions),
      JSON.stringify(actions),
      now
    );

    const rule = db.prepare('SELECT * FROM pipeline_rules WHERE id = ?').get(ruleId) as any;

    res.json({
      rule: {
        ...rule,
        conditions: JSON.parse(rule.conditions),
        actions: JSON.parse(rule.actions),
        isActive: rule.is_active === 1
      }
    });
  } catch (error: any) {
    logger.error('Failed to create pipeline rule', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Update rule
router.patch('/rules/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, conditions, actions, priority } = req.body;

    // Check ownership
    const existing = db.prepare('SELECT * FROM pipeline_rules WHERE id = ? AND user_id = ?')
      .get(id, req.user!.id) as any;
    
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    // Validate if provided
    if (conditions) {
      if (!Array.isArray(conditions) || conditions.length === 0 || conditions.length > 10) {
        return res.status(400).json({ error: 'Conditions must be array of 1-10 items' });
      }
    }

    if (actions) {
      if (!Array.isArray(actions) || actions.length === 0 || actions.length > 5) {
        return res.status(400).json({ error: 'Actions must be array of 1-5 items' });
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (conditions) {
      updates.push('conditions = ?');
      values.push(JSON.stringify(conditions));
    }
    if (actions) {
      updates.push('actions = ?');
      values.push(JSON.stringify(actions));
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    db.prepare(`UPDATE pipeline_rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const rule = db.prepare('SELECT * FROM pipeline_rules WHERE id = ?').get(id) as any;

    res.json({
      rule: {
        ...rule,
        conditions: JSON.parse(rule.conditions),
        actions: JSON.parse(rule.actions),
        isActive: rule.is_active === 1
      }
    });
  } catch (error: any) {
    logger.error('Failed to update pipeline rule', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Delete rule
router.delete('/rules/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM pipeline_rules WHERE id = ? AND user_id = ?')
      .run(id, req.user!.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to delete pipeline rule', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Toggle rule active status
router.post('/rules/:id/toggle', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rule = db.prepare('SELECT * FROM pipeline_rules WHERE id = ? AND user_id = ?')
      .get(id, req.user!.id) as any;
    
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const newStatus = rule.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE pipeline_rules SET is_active = ? WHERE id = ?').run(newStatus, id);

    res.json({ isActive: newStatus === 1 });
  } catch (error: any) {
    logger.error('Failed to toggle pipeline rule', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get rule run history
router.get('/rules/:id/runs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check ownership
    const rule = db.prepare('SELECT * FROM pipeline_rules WHERE id = ? AND user_id = ?')
      .get(id, req.user!.id) as any;
    
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const runs = db.prepare(`
      SELECT * FROM pipeline_runs
      WHERE rule_id = ?
      ORDER BY ran_at DESC
      LIMIT 50
    `).all(id) as any[];

    const formatted = runs.map(r => ({
      ...r,
      actionsRun: JSON.parse(r.actions_run)
    }));

    res.json({ runs: formatted });
  } catch (error: any) {
    logger.error('Failed to get pipeline runs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Test rule against a file (dry run)
router.post('/rules/:id/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'Missing fileId' });
    }

    // Get rule
    const ruleRow = db.prepare('SELECT * FROM pipeline_rules WHERE id = ? AND user_id = ?')
      .get(id, req.user!.id) as any;
    
    if (!ruleRow) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const rule = {
      ...ruleRow,
      conditions: JSON.parse(ruleRow.conditions),
      actions: JSON.parse(ruleRow.actions)
    };

    // Get file
    const file = await FileService.getFile(fileId, req.user!.id);

    // Evaluate conditions
    const result = PipelineService.evaluateRuleDetailed(rule, file, { trigger: 'manual' });

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to test pipeline rule', { error: error.message });
    
    if (error.message === 'File not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Manually run rule against all files
router.post('/rules/:id/run', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get rule
    const rule = db.prepare('SELECT * FROM pipeline_rules WHERE id = ? AND user_id = ?')
      .get(id, req.user!.id) as any;
    
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    // Get all user's files
    const files = db.prepare('SELECT id FROM files WHERE owner_id = ? AND is_deleted = 0')
      .all(req.user!.id) as any[];

    // Run rule for each file (async)
    setImmediate(() => {
      for (const file of files) {
        PipelineService.runRulesForFile(file.id, req.user!.id, 'manual');
      }
    });

    res.json({ 
      success: true, 
      message: `Running rule against ${files.length} files`,
      fileCount: files.length
    });
  } catch (error: any) {
    logger.error('Failed to run pipeline rule', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get available condition types
router.get('/conditions', requireAuth, async (req: Request, res: Response) => {
  try {
    const conditions = PipelineService.getConditionTypes();
    res.json({ conditions });
  } catch (error: any) {
    logger.error('Failed to get condition types', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get available action types
router.get('/actions', requireAuth, async (req: Request, res: Response) => {
  try {
    const actions = PipelineService.getActionTypes();
    res.json({ actions });
  } catch (error: any) {
    logger.error('Failed to get action types', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
