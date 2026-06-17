import { NextResponse } from 'next/server';

import { getAnimeSchedule } from '@/lib/anime-schedule';

export async function GET() {
  const schedule = getAnimeSchedule();

  return NextResponse.json({
    code: 200,
    message: '获取成功',
    data: schedule,
  });
}
