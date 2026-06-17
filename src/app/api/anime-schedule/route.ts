import { NextResponse } from 'next/server';

import { getAnimeSchedule } from '@/lib/anime-schedule';
import { getCacheTime } from '@/lib/config';

export const runtime = 'edge';

export async function GET() {
  const schedule = getAnimeSchedule();
  const cacheTime = await getCacheTime();

  return NextResponse.json(
    {
      code: 200,
      message: '获取成功',
      data: schedule,
    },
    {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    }
  );
}
