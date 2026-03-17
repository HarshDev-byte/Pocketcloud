import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import { BackupDevice, BackupManifest } from '../db/types';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { FileService } from './file.service';

export interface CheckManifestItem {
  localId: string;
  checksum: string;
}

export interface CheckManifestResult {
  alreadyBackedUp: string[];
  needsUpload: string[];
  total: number;
  percentComplete: number;
}

export interface BackupProgress {
  deviceId: string;
  deviceName: string;
  totalOnDevice: number;
  totalBackedUp: number;
  percentComplete: number;
  lastBackup: number | null;
  nextSuggestedSync: number | null;
}

export class BackupDeviceService {
  // Register or update a backup device
  static registerDevice(
    userId: string,
    deviceName: string,
    deviceOs: 'ios' | 'android'
  ): BackupDevice {
    logger.info('Registering backup device', { userId, deviceName, deviceOs });

    // Check if device already exists for this user with same name and OS
    const existing = db.prepare(`
      SELECT * FROM backup_devices 
      WHERE user_id = ? AND device_name = ? AND device_os = ?
    `).get(userId, deviceName, deviceOs) as BackupDevice | undefined;

    if (existing) {
      // Update last_seen
      db.prepare(`
        UPDATE backup_devices 
        SET last_seen = ? 
        WHERE id = ?
      `).run(Date.now(), existing.id);

      logger.info('Device already registered, updated last_seen', { deviceId: existing.id });
      return existing;
    }

    // Create new device
    const deviceId = uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO backup_devices (id, user_id, device_name, device_os, last_seen, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(deviceId, userId, deviceName, deviceOs, now, now);

    const device = db.prepare(`
      SELECT * FROM backup_devices WHERE id = ?
    `).get(deviceId) as BackupDevice;

    logger.info('Device registered successfully', { deviceId, deviceName });
    return device;
  }

  // Check manifest to determine which photos need upload
  static checkManifest(
    deviceId: string,
    items: CheckManifestItem[]
  ): CheckManifestResult {
    logger.info('Checking backup manifest', { deviceId, itemCount: items.length });

    const device = db.prepare(`
      SELECT * FROM backup_devices WHERE id = ?
    `).get(deviceId) as BackupDevice | undefined;

    if (!device) {
      throw new AppError('DEVICE_NOT_FOUND', 'Backup device not found', 404);
    }

    const alreadyBackedUp: string[] = [];
    const needsUpload: string[] = [];

    // Get all existing manifest entries for this device
    const existingManifest = db.prepare(`
      SELECT local_id, checksum FROM backup_manifest WHERE device_id = ?
    `).all(deviceId) as Array<{ local_id: string; checksum: string }>;

    const manifestMap = new Map(
      existingManifest.map(m => [m.local_id, m.checksum])
    );

    // Get all existing checksums in content_store for deduplication
    const checksums = items.map(i => i.checksum);
    const placeholders = checksums.map(() => '?').join(',');
    const existingContent = db.prepare(`
      SELECT checksum FROM content_store WHERE checksum IN (${placeholders})
    `).all(...checksums) as Array<{ checksum: string }>;

    const contentSet = new Set(existingContent.map(c => c.checksum));

    // Check each item
    for (const item of items) {
      const existingChecksum = manifestMap.get(item.localId);

      if (existingChecksum) {
        // Already backed up from this device
        alreadyBackedUp.push(item.localId);
      } else if (contentSet.has(item.checksum)) {
        // Content exists from another device/upload - can deduplicate
        alreadyBackedUp.push(item.localId);
        logger.debug('Dedup hit for photo', { localId: item.localId, checksum: item.checksum });
      } else {
        // Needs upload
        needsUpload.push(item.localId);
      }
    }

    // Update last_seen
    db.prepare(`
      UPDATE backup_devices SET last_seen = ? WHERE id = ?
    `).run(Date.now(), deviceId);

    const percentComplete = items.length > 0 
      ? Math.round((alreadyBackedUp.length / items.length) * 100)
      : 0;

    logger.info('Manifest check complete', {
      deviceId,
      total: items.length,
      alreadyBackedUp: alreadyBackedUp.length,
      needsUpload: needsUpload.length,
      percentComplete
    });

    return {
      alreadyBackedUp,
      needsUpload,
      total: items.length,
      percentComplete
    };
  }

  // Record a successful backup
  static recordBackup(
    deviceId: string,
    localId: string,
    fileId: string,
    checksum: string
  ): void {
    logger.debug('Recording backup', { deviceId, localId, fileId });

    const now = Date.now();

    // Insert or replace manifest entry
    db.prepare(`
      INSERT OR REPLACE INTO backup_manifest (device_id, local_id, file_id, checksum, backed_up_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(deviceId, localId, fileId, checksum, now);

    // Update device stats
    db.prepare(`
      UPDATE backup_devices 
      SET last_backup = ?, 
          last_seen = ?,
          total_backed_up = total_backed_up + 1
      WHERE id = ?
    `).run(now, now, deviceId);

    logger.debug('Backup recorded successfully', { deviceId, localId });
  }

  // Create manifest entry for deduplicated photo (content already exists)
  static recordDedupBackup(
    deviceId: string,
    localId: string,
    fileId: string,
    checksum: string
  ): void {
    logger.debug('Recording dedup backup', { deviceId, localId, fileId });

    const now = Date.now();

    // Insert manifest entry
    db.prepare(`
      INSERT OR REPLACE INTO backup_manifest (device_id, local_id, file_id, checksum, backed_up_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(deviceId, localId, fileId, checksum, now);

    // Update device stats
    db.prepare(`
      UPDATE backup_devices 
      SET last_backup = ?, 
          last_seen = ?,
          total_backed_up = total_backed_up + 1
      WHERE id = ?
    `).run(now, now, deviceId);

    logger.debug('Dedup backup recorded successfully', { deviceId, localId });
  }

  // Get backup progress for a device
  static getBackupProgress(deviceId: string, totalOnDevice?: number): BackupProgress {
    const device = db.prepare(`
      SELECT * FROM backup_devices WHERE id = ?
    `).get(deviceId) as BackupDevice | undefined;

    if (!device) {
      throw new AppError('DEVICE_NOT_FOUND', 'Backup device not found', 404);
    }

    const totalBackedUp = device.total_backed_up;
    const total = totalOnDevice ?? totalBackedUp;
    const percentComplete = total > 0 ? Math.round((totalBackedUp / total) * 100) : 0;

    // Suggest next sync in 24 hours if last backup was recent
    let nextSuggestedSync: number | null = null;
    if (device.last_backup) {
      nextSuggestedSync = device.last_backup + (24 * 60 * 60 * 1000);
    }

    return {
      deviceId: device.id,
      deviceName: device.device_name,
      totalOnDevice: total,
      totalBackedUp,
      percentComplete,
      lastBackup: device.last_backup,
      nextSuggestedSync
    };
  }

  // Get or create folder for device backups organized by date
  static getDeviceAlbumFolder(
    userId: string,
    deviceName: string,
    takenAt?: number
  ): string {
    const date = takenAt ? new Date(takenAt) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}-${month}`;

    // Folder structure: Camera Backup/{deviceName}/{year-month}/
    const rootName = 'Camera Backup';
    const deviceFolderName = deviceName;
    const dateFolderName = yearMonth;

    // Get or create root folder
    let rootFolder = db.prepare(`
      SELECT id FROM folders 
      WHERE owner_id = ? AND parent_id IS NULL AND name = ? AND is_deleted = 0
    `).get(userId, rootName) as { id: string } | undefined;

    if (!rootFolder) {
      const rootId = uuidv4();
      const now = Date.now();
      db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, 0, ?, ?)
      `).run(rootId, userId, rootName, `/${rootName}`, now, now);
      rootFolder = { id: rootId };
      logger.info('Created Camera Backup root folder', { folderId: rootId });
    }

    // Get or create device folder
    let deviceFolder = db.prepare(`
      SELECT id FROM folders 
      WHERE owner_id = ? AND parent_id = ? AND name = ? AND is_deleted = 0
    `).get(userId, rootFolder.id, deviceFolderName) as { id: string } | undefined;

    if (!deviceFolder) {
      const deviceId = uuidv4();
      const now = Date.now();
      const devicePath = `/${rootName}/${deviceFolderName}`;
      db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      `).run(deviceId, userId, rootFolder.id, deviceFolderName, devicePath, now, now);
      deviceFolder = { id: deviceId };
      logger.info('Created device folder', { folderId: deviceId, deviceName });
    }

    // Get or create date folder
    let dateFolder = db.prepare(`
      SELECT id FROM folders 
      WHERE owner_id = ? AND parent_id = ? AND name = ? AND is_deleted = 0
    `).get(userId, deviceFolder.id, dateFolderName) as { id: string } | undefined;

    if (!dateFolder) {
      const dateId = uuidv4();
      const now = Date.now();
      const datePath = `/${rootName}/${deviceFolderName}/${dateFolderName}`;
      db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      `).run(dateId, userId, deviceFolder.id, dateFolderName, datePath, now, now);
      dateFolder = { id: dateId };
      logger.info('Created date folder', { folderId: dateId, yearMonth });
    }

    return dateFolder.id;
  }

  // Get all backup devices for a user
  static getUserDevices(userId: string): BackupDevice[] {
    const devices = db.prepare(`
      SELECT * FROM backup_devices 
      WHERE user_id = ? 
      ORDER BY last_seen DESC
    `).all(userId) as BackupDevice[];

    return devices;
  }

  // Unregister a device (removes manifest but not files)
  static unregisterDevice(deviceId: string, userId: string): void {
    logger.info('Unregistering backup device', { deviceId, userId });

    // Verify ownership
    const device = db.prepare(`
      SELECT * FROM backup_devices WHERE id = ? AND user_id = ?
    `).get(deviceId, userId) as BackupDevice | undefined;

    if (!device) {
      throw new AppError('DEVICE_NOT_FOUND', 'Backup device not found', 404);
    }

    // Delete manifest entries
    db.prepare(`
      DELETE FROM backup_manifest WHERE device_id = ?
    `).run(deviceId);

    // Delete device
    db.prepare(`
      DELETE FROM backup_devices WHERE id = ?
    `).run(deviceId);

    logger.info('Device unregistered successfully', { deviceId });
  }

  // Get device by ID with ownership check
  static getDevice(deviceId: string, userId: string): BackupDevice {
    const device = db.prepare(`
      SELECT * FROM backup_devices WHERE id = ? AND user_id = ?
    `).get(deviceId, userId) as BackupDevice | undefined;

    if (!device) {
      throw new AppError('DEVICE_NOT_FOUND', 'Backup device not found', 404);
    }

    return device;
  }
}
