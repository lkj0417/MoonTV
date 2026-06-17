/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import runtimeConfig from './runtime';

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

export interface ConfigFileStruct {
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

export async function loadConfigFile(): Promise<ConfigFileStruct> {
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
