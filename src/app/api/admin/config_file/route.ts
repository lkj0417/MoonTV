/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    // 验证身份和权限
    const authInfo = getAuthInfoFromCookie(req);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查用户权限（只有站长可以保存配置文件）
    if (authInfo.username !== process.env.USERNAME) {
      return NextResponse.json(
        { error: '权限不足，只有站长可以保存配置文件' },
        { status: 401 }
      );
    }

    const { configFile, subscriptionUrl, autoUpdate, lastCheckTime } =
      await req.json();

    // 验证配置文件内容
    if (!configFile || typeof configFile !== 'string') {
      return NextResponse.json({ error: '配置文件内容无效' }, { status: 400 });
    }

    // 验证 JSON 格式
    try {
      const parsed = JSON.parse(configFile);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('配置文件必须是 JSON 对象');
      }
    } catch (error) {
      return NextResponse.json(
        { error: '配置文件必须是有效的 JSON 格式' },
        { status: 400 }
      );
    }

    // 获取当前配置
    const currentConfig = await db.getAdminConfig();
    if (!currentConfig) {
      return NextResponse.json({ error: '无法获取当前配置' }, { status: 500 });
    }

    // 更新配置
    const updatedConfig = {
      ...currentConfig,
      ConfigFile: configFile,
      ConfigSubscribtion: {
        URL: subscriptionUrl || '',
        AutoUpdate: Boolean(autoUpdate),
        LastCheck: lastCheckTime || new Date().toISOString(),
      },
    };

    await db.saveAdminConfig(updatedConfig);

    return NextResponse.json({
      message: '配置文件保存成功',
      configSubscribtion: updatedConfig.ConfigSubscribtion,
    });
  } catch (error) {
    console.error('保存配置文件失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '保存失败' },
      { status: 500 }
    );
  }
}
