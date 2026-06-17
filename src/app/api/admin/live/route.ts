/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { deleteCachedLiveChannels, refreshLiveChannels } from '@/lib/live';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    // 验证身份和权限
    const authInfo = getAuthInfoFromCookie(req);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查用户权限（只有站长可以管理直播源）
    if (authInfo.username !== process.env.USERNAME) {
      return NextResponse.json(
        { error: '权限不足，只有站长可以管理直播源' },
        { status: 401 }
      );
    }

    const { action, source, key } = await req.json();

    if (!action) {
      return NextResponse.json({ error: '缺少操作类型' }, { status: 400 });
    }

    const currentConfig = await db.getAdminConfig();
    if (!currentConfig) {
      return NextResponse.json({ error: '无法获取当前配置' }, { status: 500 });
    }

    // 确保 LiveConfig 数组存在
    if (!currentConfig.LiveConfig) {
      currentConfig.LiveConfig = [];
    }

    switch (action) {
      case 'add': {
        // 添加新的直播源
        if (!source || !source.name || !source.url) {
          return NextResponse.json(
            { error: '直播源信息不完整' },
            { status: 400 }
          );
        }

        // 检查是否已存在同名直播源
        const exists = currentConfig.LiveConfig.some(
          (s) => s.key === source.key
        );
        if (exists) {
          return NextResponse.json({ error: '直播源已存在' }, { status: 400 });
        }

        currentConfig.LiveConfig.push({
          key: source.key,
          name: source.name,
          url: source.url,
          ua: source.ua || '',
          epg: source.epg || '',
          from: 'custom',
          disabled: false,
        });

        // Refresh channels for the new source
        try {
          const nums = await refreshLiveChannels({
            key: source.key,
            name: source.name,
            url: source.url,
            ua: source.ua || '',
            epg: source.epg || '',
            from: 'custom',
            disabled: false,
          });
          const added = currentConfig.LiveConfig.find(
            (s) => s.key === source.key
          );
          if (added) added.channelNumber = nums;
        } catch (error) {
          console.error('Failed to refresh channels:', error);
        }

        setCachedConfig(currentConfig);
        await db.saveAdminConfig(currentConfig);
        return NextResponse.json({
          message: '添加成功',
          liveConfig: currentConfig.LiveConfig,
        });
      }

      case 'update': {
        // 更新直播源
        if (!source || !source.key) {
          return NextResponse.json(
            { error: '直播源信息不完整' },
            { status: 400 }
          );
        }

        const index = currentConfig.LiveConfig.findIndex(
          (s) => s.key === source.key
        );
        if (index === -1) {
          return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
        }

        // config 源的 url 不能通过 custom 更新
        if (currentConfig.LiveConfig[index].from === 'config' && source.url) {
          delete source.url;
        }

        currentConfig.LiveConfig[index] = {
          ...currentConfig.LiveConfig[index],
          ...source,
        };

        setCachedConfig(currentConfig);
        await db.saveAdminConfig(currentConfig);
        return NextResponse.json({
          message: '更新成功',
          liveConfig: currentConfig.LiveConfig,
        });
      }

      case 'delete': {
        // 删除直播源
        if (!key) {
          return NextResponse.json(
            { error: '缺少直播源 key' },
            { status: 400 }
          );
        }

        const sourceToDelete = currentConfig.LiveConfig.find(
          (s) => s.key === key
        );
        if (sourceToDelete?.from === 'config') {
          return NextResponse.json(
            { error: '内置直播源不可删除' },
            { status: 403 }
          );
        }

        deleteCachedLiveChannels(key);

        currentConfig.LiveConfig = currentConfig.LiveConfig.filter(
          (s) => s.key !== key
        );

        setCachedConfig(currentConfig);
        await db.saveAdminConfig(currentConfig);
        return NextResponse.json({
          message: '删除成功',
          liveConfig: currentConfig.LiveConfig,
        });
      }

      case 'enable': {
        // 启用直播源
        const enableSource = currentConfig.LiveConfig.find(
          (l) => l.key === key
        );
        if (!enableSource) {
          return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
        }
        enableSource.disabled = false;
        setCachedConfig(currentConfig);
        await db.saveAdminConfig(currentConfig);
        return NextResponse.json({ message: '启用成功' });
      }

      case 'disable': {
        // 禁用直播源
        const disableSource = currentConfig.LiveConfig.find(
          (l) => l.key === key
        );
        if (!disableSource) {
          return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
        }
        disableSource.disabled = true;
        setCachedConfig(currentConfig);
        await db.saveAdminConfig(currentConfig);
        return NextResponse.json({ message: '禁用成功' });
      }

      case 'edit': {
        // 编辑直播源（与 update 不同的是接收独立的字段而非 source 对象）
        const { key: editKey, name, url, ua, epg } = await req.json();
        const editSource = currentConfig.LiveConfig.find(
          (l) => l.key === editKey
        );
        if (!editSource) {
          return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
        }

        // 配置文件中的直播源不允许编辑
        if (editSource.from === 'config') {
          return NextResponse.json(
            { error: '不能编辑配置文件中的直播源' },
            { status: 400 }
          );
        }

        editSource.name = name as string;
        editSource.url = url as string;
        editSource.ua = ua || '';
        editSource.epg = epg || '';

        // 刷新频道数
        try {
          const nums = await refreshLiveChannels(editSource);
          editSource.channelNumber = nums;
        } catch (error) {
          console.error('刷新直播源失败:', error);
          editSource.channelNumber = 0;
        }

        setCachedConfig(currentConfig);
        await db.saveAdminConfig(currentConfig);
        return NextResponse.json({ message: '编辑成功' });
      }

      case 'sort': {
        // 排序直播源
        const { order } = await req.json();

        if (!Array.isArray(order)) {
          return NextResponse.json(
            { error: '排序数据格式错误' },
            { status: 400 }
          );
        }

        // 创建新的排序后的数组
        const sortedLiveConfig: typeof currentConfig.LiveConfig = [];
        order.forEach((orderKey: string) => {
          const sourceItem = currentConfig.LiveConfig?.find(
            (l) => l.key === orderKey
          );
          if (sourceItem) {
            sortedLiveConfig.push(sourceItem);
          }
        });

        // 添加未在排序列表中的直播源（保持原有顺序）
        currentConfig.LiveConfig.forEach((sourceItem) => {
          if (!order.includes(sourceItem.key)) {
            sortedLiveConfig.push(sourceItem);
          }
        });

        currentConfig.LiveConfig = sortedLiveConfig;

        setCachedConfig(currentConfig);
        await db.saveAdminConfig(currentConfig);
        return NextResponse.json({ message: '排序成功' });
      }

      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }
  } catch (error) {
    console.error('管理直播源失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 }
    );
  }
}
