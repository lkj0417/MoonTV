/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

// server-config needs access to getConfig which may use Node built-ins in
// certain deployment modes. Force Node runtime to avoid bundling issues.
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const config = await getConfig();
  const result = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
  };
  return NextResponse.json(result);
}
