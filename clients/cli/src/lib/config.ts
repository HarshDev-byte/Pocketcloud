/**
 * Configuration management for PocketCloud CLI
 * Stores settings in ~/.config/pocketcloud/config.json
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

export interface PocketCloudConfig {
  host?: string;
  ip?: string;
  port?: number;
  username?: string;
  token?: string;
  lastConnected?: number;
  defaultSyncPath?: string;
  chunkSize?: number;
  debug?: boolean;
  stealthMode?: boolean;
  encryptionEnabled?: boolean;
}

class ConfigManager {
  private configDir: string;
  private configFile: string;
  private uploadsDir: string;
  private _config: PocketCloudConfig = {};

  constructor() {
    this.configDir = join(homedir(), '.config', 'pocketcloud');
    this.configFile = join(this.configDir, 'config.json');
    this.uploadsDir = join(this.configDir, 'uploads');
    
    this.ensureConfigDir();
    this.load();
  }

  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private load(): void {
    if (existsSync(this.configFile)) {
      try {
        const data = readFileSync(this.configFile, 'utf8');
        this._config = JSON.parse(data);
      } catch (error) {
        console.warn('Failed to load config, using defaults');
        this._config = {};
      }
    }
  }

  public save(): void {
    try {
      writeFileSync(this.configFile, JSON.stringify(this._config, null, 2));
    } catch (error) {
      throw new Error(`Failed to save config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public get<K extends keyof PocketCloudConfig>(key: K): PocketCloudConfig[K] {
    return this._config[key];
  }

  public set<K extends keyof PocketCloudConfig>(key: K, value: PocketCloudConfig[K]): void {
    this._config[key] = value;
    this.save();
  }

  public getAll(): PocketCloudConfig {
    return { ...this._config };
  }

  public clear(): void {
    this._config = {};
    this.save();
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public getUploadsDir(): string {
    return this.uploadsDir;
  }

  public isConfigured(): boolean {
    return !!(this._config.host || this._config.ip) && !!this._config.token;
  }

  public getConnectionUrl(): string {
    const host = this._config.host || this._config.ip || 'localhost';
    const port = this._config.port || 3000;
    return `http://${host}:${port}`;
  }

  public getWebDAVUrl(): string {
    return `${this.getConnectionUrl()}/webdav`;
  }

  // Default configuration values
  public getDefaults(): Partial<PocketCloudConfig> {
    return {
      port: 3000,
      chunkSize: 10, // MB
      debug: false,
      stealthMode: false,
      encryptionEnabled: false
    };
  }
}

export const config = new ConfigManager();