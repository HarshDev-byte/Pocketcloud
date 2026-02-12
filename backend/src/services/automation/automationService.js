const { getDatabase, saveDatabase } = require('../../config/database');
const path = require('path');
const fs = require('fs-extra');

class AutomationService {
  constructor() {
    this.ruleTypes = ['auto_organize', 'auto_cleanup', 'auto_tag', 'auto_backup'];
  }

  /**
   * Create automation rule
   */
  async createRule(userId, name, type, conditions, actions) {
    try {
      const db = getDatabase();
      
      db.run(
        `INSERT INTO automation_rules (user_id, name, type, conditions, actions)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, name, type, JSON.stringify(conditions), JSON.stringify(actions)]
      );

      saveDatabase();

      const result = db.exec(
        `SELECT * FROM automation_rules 
         WHERE user_id = ${userId} 
         ORDER BY id DESC LIMIT 1`
      )[0];

      if (result && result.values.length > 0) {
        return this.formatRule(result.values[0]);
      }
    } catch (error) {
      console.error('Error creating automation rule:', error);
      throw error;
    }
  }

  /**
   * Get user rules
   */
  async getUserRules(userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT * FROM automation_rules 
         WHERE user_id = ${userId} 
         ORDER BY created_at DESC`
      )[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => this.formatRule(row));
    } catch (error) {
      console.error('Error getting automation rules:', error);
      return [];
    }
  }

  /**
   * Get rule by ID
   */
  async getRule(ruleId, userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT * FROM automation_rules 
         WHERE id = ${ruleId} AND user_id = ${userId}`
      )[0];

      if (!result || !result.values.length) {
        return null;
      }

      return this.formatRule(result.values[0]);
    } catch (error) {
      console.error('Error getting rule:', error);
      return null;
    }
  }

  /**
   * Update rule
   */
  async updateRule(ruleId, userId, updates) {
    try {
      const db = getDatabase();
      
      const { name, conditions, actions, enabled } = updates;
      
      const sets = [];
      const values = [];
      
      if (name !== undefined) {
        sets.push('name = ?');
        values.push(name);
      }
      if (conditions !== undefined) {
        sets.push('conditions = ?');
        values.push(JSON.stringify(conditions));
      }
      if (actions !== undefined) {
        sets.push('actions = ?');
        values.push(JSON.stringify(actions));
      }
      if (enabled !== undefined) {
        sets.push('enabled = ?');
        values.push(enabled ? 1 : 0);
      }
      
      values.push(ruleId, userId);
      
      db.run(
        `UPDATE automation_rules 
         SET ${sets.join(', ')}
         WHERE id = ? AND user_id = ?`,
        values
      );

      saveDatabase();

      return await this.getRule(ruleId, userId);
    } catch (error) {
      console.error('Error updating rule:', error);
      throw error;
    }
  }

  /**
   * Delete rule
   */
  async deleteRule(ruleId, userId) {
    try {
      const db = getDatabase();
      
      db.run(
        'DELETE FROM automation_rules WHERE id = ? AND user_id = ?',
        [ruleId, userId]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error deleting rule:', error);
      throw error;
    }
  }

  /**
   * Run rule manually
   */
  async runRule(ruleId, userId) {
    try {
      const rule = await this.getRule(ruleId, userId);
      
      if (!rule) {
        throw new Error('Rule not found');
      }

      if (!rule.enabled) {
        throw new Error('Rule is disabled');
      }

      const result = await this.executeRule(rule, userId);

      // Update last run
      const db = getDatabase();
      db.run(
        'UPDATE automation_rules SET last_run = CURRENT_TIMESTAMP WHERE id = ?',
        [ruleId]
      );
      saveDatabase();

      return result;
    } catch (error) {
      console.error('Error running rule:', error);
      throw error;
    }
  }

  /**
   * Execute rule
   */
  async executeRule(rule, userId) {
    try {
      switch (rule.type) {
        case 'auto_organize':
          return await this.executeOrganizeRule(rule, userId);
        case 'auto_cleanup':
          return await this.executeCleanupRule(rule, userId);
        case 'auto_tag':
          return await this.executeTagRule(rule, userId);
        default:
          throw new Error(`Unknown rule type: ${rule.type}`);
      }
    } catch (error) {
      console.error('Error executing rule:', error);
      throw error;
    }
  }

  /**
   * Execute organize rule
   */
  async executeOrganizeRule(rule, userId) {
    try {
      const db = getDatabase();
      const { conditions, actions } = rule;
      
      // Build query based on conditions
      let query = `SELECT * FROM files WHERE user_id = ${userId} AND status = 'active'`;
      
      if (conditions.fileType) {
        const pattern = conditions.fileType.replace('*', '%');
        query += ` AND mimetype LIKE '${pattern}'`;
      }
      
      if (conditions.folder) {
        query += ` AND filepath LIKE '${conditions.folder}%'`;
      }
      
      if (conditions.filename) {
        const pattern = conditions.filename.replace('*', '%');
        query += ` AND filename LIKE '${pattern}'`;
      }

      const result = db.exec(query)[0];
      
      if (!result || !result.values.length) {
        return { processed: 0, moved: 0 };
      }

      let moved = 0;
      
      for (const row of result.values) {
        const fileId = row[0];
        const filename = row[2];
        const currentPath = row[3];
        
        if (actions.moveToFolder) {
          // Move file to target folder
          const targetFolder = actions.moveToFolder;
          const newPath = path.join(targetFolder, filename);
          
          // Update database
          db.run(
            'UPDATE files SET filepath = ? WHERE id = ?',
            [newPath, fileId]
          );
          
          moved++;
        }
      }

      saveDatabase();

      return {
        processed: result.values.length,
        moved
      };
    } catch (error) {
      console.error('Error executing organize rule:', error);
      throw error;
    }
  }

  /**
   * Execute cleanup rule
   */
  async executeCleanupRule(rule, userId) {
    try {
      const db = getDatabase();
      const { conditions, actions } = rule;
      
      let query = `SELECT * FROM files WHERE user_id = ${userId} AND status = 'active'`;
      
      if (conditions.folder) {
        query += ` AND filepath LIKE '${conditions.folder}%'`;
      }
      
      if (conditions.olderThan) {
        const days = parseInt(conditions.olderThan);
        query += ` AND datetime(uploaded_at) < datetime('now', '-${days} days')`;
      }
      
      if (conditions.fileType) {
        const pattern = conditions.fileType.replace('*', '%');
        query += ` AND mimetype LIKE '${pattern}'`;
      }

      const result = db.exec(query)[0];
      
      if (!result || !result.values.length) {
        return { processed: 0, deleted: 0 };
      }

      let deleted = 0;
      
      if (actions.delete) {
        for (const row of result.values) {
          const fileId = row[0];
          
          // Move to trash
          db.run(
            `UPDATE files 
             SET status = 'trashed', trashed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [fileId]
          );
          
          deleted++;
        }
      }

      saveDatabase();

      return {
        processed: result.values.length,
        deleted
      };
    } catch (error) {
      console.error('Error executing cleanup rule:', error);
      throw error;
    }
  }

  /**
   * Execute tag rule
   */
  async executeTagRule(rule, userId) {
    try {
      const db = getDatabase();
      const { conditions, actions } = rule;
      
      let query = `SELECT * FROM files WHERE user_id = ${userId} AND status = 'active'`;
      
      if (conditions.filename) {
        const pattern = conditions.filename.replace('*', '%');
        query += ` AND filename LIKE '${pattern}'`;
      }
      
      if (conditions.fileType) {
        const pattern = conditions.fileType.replace('*', '%');
        query += ` AND mimetype LIKE '${pattern}'`;
      }

      const result = db.exec(query)[0];
      
      if (!result || !result.values.length) {
        return { processed: 0, tagged: 0 };
      }

      let tagged = 0;
      
      if (actions.addTags && actions.addTags.length > 0) {
        const taggingService = require('./taggingService');
        
        for (const row of result.values) {
          const fileId = row[0];
          
          for (const tagName of actions.addTags) {
            await taggingService.addTagToFile(fileId, tagName, userId, true);
          }
          
          tagged++;
        }
      }

      return {
        processed: result.values.length,
        tagged
      };
    } catch (error) {
      console.error('Error executing tag rule:', error);
      throw error;
    }
  }

  /**
   * Run all enabled rules for user
   */
  async runAllRules(userId) {
    try {
      const rules = await this.getUserRules(userId);
      const enabledRules = rules.filter(r => r.enabled);
      
      const results = [];
      
      for (const rule of enabledRules) {
        try {
          const result = await this.executeRule(rule, userId);
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            success: false,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error running all rules:', error);
      throw error;
    }
  }

  /**
   * Format rule from database row
   */
  formatRule(row) {
    return {
      id: row[0],
      userId: row[1],
      name: row[2],
      type: row[3],
      conditions: JSON.parse(row[4]),
      actions: JSON.parse(row[5]),
      enabled: row[6] === 1,
      lastRun: row[7],
      createdAt: row[8]
    };
  }

  /**
   * Get rule statistics
   */
  async getRuleStats(userId) {
    try {
      const db = getDatabase();
      
      const total = db.exec(
        `SELECT COUNT(*) FROM automation_rules WHERE user_id = ${userId}`
      )[0];

      const enabled = db.exec(
        `SELECT COUNT(*) FROM automation_rules 
         WHERE user_id = ${userId} AND enabled = 1`
      )[0];

      const byType = db.exec(
        `SELECT type, COUNT(*) as count 
         FROM automation_rules 
         WHERE user_id = ${userId}
         GROUP BY type`
      )[0];

      return {
        total: total?.values[0][0] || 0,
        enabled: enabled?.values[0][0] || 0,
        byType: byType?.values.map(row => ({
          type: row[0],
          count: row[1]
        })) || []
      };
    } catch (error) {
      console.error('Error getting rule stats:', error);
      return { total: 0, enabled: 0, byType: [] };
    }
  }
}

module.exports = new AutomationService();
