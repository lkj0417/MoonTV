/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { getStorage } from '@/lib/db';

import { AdminConfig, Source, CustomCategory } from './admin.types';
import runtimeConfig from './runtime';

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

interface ConfigFileStruct {
  cache_time?: number;
  api_site: {
    [key: string]: ApiSite;
  };
  custom_category?: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
  }[];
}

export const API_CONFIG = {
  search: {
    path: '?ac=videolist&wd=',
    pagePath: '?ac=videolist&wd={query}&pg={page}',
    headers: {
      Accept: 'application/json',
    },
  },
  detail: {
    path: '?ac=videolist&ids=',
    headers: {
      Accept: 'application/json',
    },
  },
};

let cachedConfig: AdminConfig | null = null;

async function loadConfigFile(): Promise<ConfigFileStruct> {
  if (process.env.DOCKER_ENV === 'true') {
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    console.log('load dynamic config success');
    return JSON.parse(raw);
  }
  return runtimeConfig as unknown as ConfigFileStruct;
}

function createDefaultAdminConfig(fileConfig: ConfigFileStruct, users: { username: string; role: 'user' | 'owner' }[]): AdminConfig {
  const apiSiteEntries = Object.entries(fileConfig.api_site);
  const customCategories = fileConfig.custom_category || [];

  return {
    SiteConfig: {
      SiteName: process.env.SITE_NAME || 'MoonTV',
      Announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      SearchDownstreamMaxPage:
        Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
      SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
      DoubanProxyType:
        process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'cmliussss-cdn-tencent',
      DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
      DoubanImageProxyType:
        process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE || 'cmliussss-cdn-tencent',
      DoubanImageProxy: process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY || '',
      ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
      DisableYellowFilter:
        process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
      UserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
    UserConfig: {
      AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
      Users: users,
    },
    SourceConfig: apiSiteEntries.map(([key, site]) => ({
      key,
      name: site.name,
      api: site.api,
      detail: site.detail,
      from: 'config',
      disabled: false,
    })),
    CustomCategories: customCategories.map((category) => ({
      name: category.name,
      type: category.type,
      query: category.query,
      from: 'config',
      disabled: false,
    })),
  };
}

function mergeSourceConfig(adminConfig: AdminConfig, fileConfig: ConfigFileStruct) {
  const sourceConfigMap = new Map(adminConfig.SourceConfig.map(s => [s.key, s]));
  Object.entries(fileConfig.api_site).forEach(([key, site]) => {
    sourceConfigMap.set(key, { ...site, from: 'config', disabled: false });
  });
  adminConfig.SourceConfig = Array.from(sourceConfigMap.values());
  adminConfig.SourceConfig.forEach(source => {
    if (!fileConfig.api_site[source.key]) {
      source.from = 'custom';
    }
  });
}

function mergeCustomCategories(adminConfig: AdminConfig, fileConfig: ConfigFileStruct) {
  const customCategoriesMap = new Map(adminConfig.CustomCategories.map(c => [c.query + c.type, c]));
  (fileConfig.custom_category || []).forEach(category => {
    customCategoriesMap.set(category.query + category.type, { ...category, from: 'config', disabled: false });
  });
  adminConfig.CustomCategories = Array.from(customCategoriesMap.values());
  adminConfig.CustomCategories.forEach(category => {
    if (!(fileConfig.custom_category || []).some(c => c.query === category.query && c.type === category.type)) {
      category.from = 'custom';
    }
  });
}

function mergeUserConfig(adminConfig: AdminConfig, users: { username: string; role: 'user' | 'owner' }[]) {
  const existingUsers = new Set(adminConfig.UserConfig.Users.map(u => u.username));
  users.forEach(user => {
    if (!existingUsers.has(user.username)) {
      adminConfig.UserConfig.Users.push(user);
    }
  });
}

async function initConfig() {
  if (cachedConfig) {
    return;
  }

  const fileConfig = await loadConfigFile();
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  if (storageType !== 'localstorage') {
    const storage = getStorage();
    try {
      let adminConfig = await storage.getAdminConfig();
      const userNames = await storage.getAllUsers().catch(() => []);

      const users = userNames.map(username => ({ username, role: 'user' as const }));
      const ownerUsername = process.env.USERNAME;
      if (ownerUsername) {
        const ownerIndex = users.findIndex(u => u.username === ownerUsername);
        if (ownerIndex !== -1) {
          users[ownerIndex].role = 'owner';
        } else {
          users.unshift({ username: ownerUsername, role: 'owner' });
        }
      }

      if (adminConfig) {
        mergeSourceConfig(adminConfig, fileConfig);
        mergeCustomCategories(adminConfig, fileConfig);
        mergeUserConfig(adminConfig, users);
        cachedConfig = adminConfig;
      } else {
        cachedConfig = createDefaultAdminConfig(fileConfig, users);
      }
      await storage.setAdminConfig(cachedConfig);
    } catch (err) {
      console.error('加载管理员配置失败:', err);
      cachedConfig = createDefaultAdminConfig(fileConfig, []);
    }
  } else {
    cachedConfig = createDefaultAdminConfig(fileConfig, []);
  }
}

export async function getConfig(): Promise<AdminConfig> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (!cachedConfig || storageType !== 'localstorage') {
    await initConfig();
  }
  // Non-null assertion is safe here because initConfig ensures cachedConfig is set.
  return cachedConfig!;
}

export async function resetConfig() {
  const storage = getStorage();
  const userNames = await storage.getAllUsers().catch(() => []);
  const users = userNames.map(username => ({ username, role: 'user' as const }));
  const ownerUsername = process.env.USERNAME;
  if (ownerUsername) {
    const ownerIndex = users.findIndex(u => u.username === ownerUsername);
    if (ownerIndex !== -1) {
      users[ownerIndex].role = 'owner';
    } else {
      users.unshift({ username: ownerUsername, role: 'owner' });
    }
  }

  const fileConfig = await loadConfigFile();
  const newConfig = createDefaultAdminConfig(fileConfig, users);

  if (process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'localstorage') {
      await storage.setAdminConfig(newConfig);
  }
  cachedConfig = newConfig;
}

export async function getCacheTime(): Promise<number> {
  const config = await getConfig();
  return config.SiteConfig.SiteInterfaceCacheTime || 7200;
}

export async function getAvailableApiSites(): Promise<ApiSite[]> {
  const config = await getConfig();
  return config.SourceConfig.filter((s) => !s.disabled).map((s) => ({
    key: s.key,
    name: s.name,
    api: s.api,
    detail: s.detail,
  }));
}

export function setCachedConfig(config: AdminConfig): void {
  cachedConfig = config;
}

export function configSelfCheck(config: AdminConfig): AdminConfig {
  const defaultConfig = createDefaultAdminConfig({ api_site: {}, custom_category: [] }, []);
  if (!config.SiteConfig) config.SiteConfig = defaultConfig.SiteConfig;
  if (!config.UserConfig) config.UserConfig = defaultConfig.UserConfig;
  if (!config.SourceConfig) config.SourceConfig = [];
  if (!config.CustomCategories) config.CustomCategories = [];
  return config;
}