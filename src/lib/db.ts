/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { AdminConfig } from './admin.types';
import { D1Storage } from './d1.db';
import { RedisStorage } from './redis.db';
import { Favorite, IStorage, PlayRecord, SkipConfig } from './types';
import { UpstashRedisStorage } from './upstash.db';

// storage type 常量: 'localstorage' | 'redis' | 'd1' | 'upstash'，默认 'localstorage'
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | 'upstash'
    | undefined) || 'localstorage';

export class MemoryStorage implements IStorage {
  private playRecords = new Map<string, Map<string, PlayRecord>>();
  private favorites = new Map<string, Map<string, Favorite>>();
  private users = new Map<string, string>(); // username -> password
  private searchHistories = new Map<string, string[]>();
  private adminConfig: AdminConfig | null = null;
  private skipConfigs = new Map<string, Map<string, SkipConfig>>();

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const userMap = this.playRecords.get(userName);
    return userMap?.get(key) || null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    if (!this.playRecords.has(userName)) {
      this.playRecords.set(userName, new Map());
    }
    this.playRecords.get(userName)!.set(key, record);
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<{ [key: string]: PlayRecord }> {
    const userMap = this.playRecords.get(userName);
    if (!userMap) return {};
    const res: { [key: string]: PlayRecord } = {};
    userMap.forEach((v, k) => {
      res[k] = v;
    });
    return res;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    this.playRecords.get(userName)?.delete(key);
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const userMap = this.favorites.get(userName);
    return userMap?.get(key) || null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    if (!this.favorites.has(userName)) {
      this.favorites.set(userName, new Map());
    }
    this.favorites.get(userName)!.set(key, favorite);
  }

  async getAllFavorites(
    userName: string
  ): Promise<{ [key: string]: Favorite }> {
    const userMap = this.favorites.get(userName);
    if (!userMap) return {};
    const res: { [key: string]: Favorite } = {};
    userMap.forEach((v, k) => {
      res[k] = v;
    });
    return res;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    this.favorites.get(userName)?.delete(key);
  }

  async registerUser(userName: string, password: string): Promise<void> {
    this.users.set(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    return this.users.get(userName) === password;
  }

  async checkUserExist(userName: string): Promise<boolean> {
    return this.users.has(userName);
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    if (this.users.has(userName)) {
      this.users.set(userName, newPassword);
    }
  }

  async deleteUser(userName: string): Promise<void> {
    this.users.delete(userName);
    this.playRecords.delete(userName);
    this.favorites.delete(userName);
    this.searchHistories.delete(userName);
    this.skipConfigs.delete(userName);
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    return this.searchHistories.get(userName) || [];
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const list = this.searchHistories.get(userName) || [];
    const filtered = list.filter((item) => item !== keyword);
    filtered.unshift(keyword);
    if (filtered.length > 20) {
      filtered.pop();
    }
    this.searchHistories.set(userName, filtered);
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    if (!keyword) {
      this.searchHistories.set(userName, []);
    } else {
      const list = this.searchHistories.get(userName) || [];
      this.searchHistories.set(
        userName,
        list.filter((item) => item !== keyword)
      );
    }
  }

  async getAllUsers(): Promise<string[]> {
    return Array.from(this.users.keys());
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    return this.adminConfig;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    this.adminConfig = config;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    const key = `${source}+${id}`;
    const userMap = this.skipConfigs.get(userName);
    return userMap?.get(key) || null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    if (!this.skipConfigs.has(userName)) {
      this.skipConfigs.set(userName, new Map());
    }
    const key = `${source}+${id}`;
    this.skipConfigs.get(userName)!.set(key, config);
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = `${source}+${id}`;
    this.skipConfigs.get(userName)?.delete(key);
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    const userMap = this.skipConfigs.get(userName);
    if (!userMap) return {};
    const res: { [key: string]: SkipConfig } = {};
    userMap.forEach((v, k) => {
      res[k] = v;
    });
    return res;
  }
}

// 创建存储实例
function createStorage(): IStorage {
  switch (STORAGE_TYPE) {
    case 'redis':
      return new RedisStorage();
    case 'upstash':
      return new UpstashRedisStorage();
    case 'd1':
      return new D1Storage();
    case 'localstorage':
    default:
      // 默认返回内存实现，保证本地开发可用
      return new MemoryStorage();
  }
}

// 单例存储实例
let storageInstance: IStorage | null = null;

export function getStorage(): IStorage {
  if (!storageInstance) {
    storageInstance = createStorage();
  }
  return storageInstance;
}

// 工具函数：生成存储key
export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

// 导出便捷方法
export class DbManager {
  private storage: IStorage;

  constructor() {
    this.storage = getStorage();
  }

  // 播放记录相关方法
  async getPlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<PlayRecord | null> {
    const key = generateStorageKey(source, id);
    return this.storage.getPlayRecord(userName, key);
  }

  async savePlayRecord(
    userName: string,
    source: string,
    id: string,
    record: PlayRecord
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.setPlayRecord(userName, key, record);
  }

  async getAllPlayRecords(userName: string): Promise<{
    [key: string]: PlayRecord;
  }> {
    return this.storage.getAllPlayRecords(userName);
  }

  async deletePlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.deletePlayRecord(userName, key);
  }

  // 收藏相关方法
  async getFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<Favorite | null> {
    const key = generateStorageKey(source, id);
    return this.storage.getFavorite(userName, key);
  }

  async saveFavorite(
    userName: string,
    source: string,
    id: string,
    favorite: Favorite
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.setFavorite(userName, key, favorite);
  }

  async getAllFavorites(
    userName: string
  ): Promise<{ [key: string]: Favorite }> {
    return this.storage.getAllFavorites(userName);
  }

  async deleteFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.deleteFavorite(userName, key);
  }

  async isFavorited(
    userName: string,
    source: string,
    id: string
  ): Promise<boolean> {
    const favorite = await this.getFavorite(userName, source, id);
    return favorite !== null;
  }

  // ---------- 用户相关 ----------
  async registerUser(userName: string, password: string): Promise<void> {
    await this.storage.registerUser(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    return this.storage.verifyUser(userName, password);
  }

  // 检查用户是否已存在
  async checkUserExist(userName: string): Promise<boolean> {
    return this.storage.checkUserExist(userName);
  }

  // ---------- 搜索历史 ----------
  async getSearchHistory(userName: string): Promise<string[]> {
    return this.storage.getSearchHistory(userName);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    await this.storage.addSearchHistory(userName, keyword);
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    await this.storage.deleteSearchHistory(userName, keyword);
  }

  // 获取全部用户名
  async getAllUsers(): Promise<string[]> {
    if (typeof (this.storage as any).getAllUsers === 'function') {
      return (this.storage as any).getAllUsers();
    }
    return [];
  }

  // ---------- 管理员配置 ----------
  async getAdminConfig(): Promise<AdminConfig | null> {
    if (typeof (this.storage as any).getAdminConfig === 'function') {
      return (this.storage as any).getAdminConfig();
    }
    return null;
  }

  async saveAdminConfig(config: AdminConfig): Promise<void> {
    if (typeof (this.storage as any).setAdminConfig === 'function') {
      await (this.storage as any).setAdminConfig(config);
    }
  }

  // ---------- 跳过片头片尾配置 ----------
  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    if (typeof (this.storage as any).getSkipConfig === 'function') {
      return (this.storage as any).getSkipConfig(userName, source, id);
    }
    return null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    if (typeof (this.storage as any).setSkipConfig === 'function') {
      await (this.storage as any).setSkipConfig(userName, source, id, config);
    }
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    if (typeof (this.storage as any).deleteSkipConfig === 'function') {
      await (this.storage as any).deleteSkipConfig(userName, source, id);
    }
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    if (typeof (this.storage as any).getAllSkipConfigs === 'function') {
      return (this.storage as any).getAllSkipConfigs(userName);
    }
    return {};
  }

  // ---------- 清空所有数据 ----------
  async clearAllData(): Promise<void> {
    if (typeof (this.storage as any).clearAllData === 'function') {
      await (this.storage as any).clearAllData();
    }
  }
}

// 导出默认实例
export const db = new DbManager();
