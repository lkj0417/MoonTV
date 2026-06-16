/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { NextRequest, NextResponse } from 'next/server';

import { deleteCachedLiveChannels, refreshLiveChannels } from '@/lib/live';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json();

    if (!key) {
      return NextResponse.json({ error: '缺少直播源 key' }, { status: 400 });
    }

    // 获取当前配置中的直播源信息
    const { getConfig } = await import('../../../../lib/config');
    const config = await getConfig();

    const liveInfo = config.LiveConfig?.find(live => live.key === key);
    if (!liveInfo) {
      return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
    }

    // 清除缓存
    deleteCachedLiveChannels(key);

    // 刷新频道列表
    const channelNum = await refreshLiveChannels(liveInfo);

    return NextResponse.json({
      message: '刷新成功',
      channelNumber: channelNum,
    });
  } catch (error) {
    console.error('刷新直播源失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '刷新失败' },
      { status: 500 }
    );
  }
}
