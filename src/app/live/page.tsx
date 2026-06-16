/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { Tv, Radio, ChevronDown, Search, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { getCachedLiveChannels } from '@/lib/live';
import type { LiveChannels } from '@/lib/live';
import PageLayout from '@/components/PageLayout';

interface LiveChannel {
  id: string;
  tvgId: string;
  name: string;
  logo: string;
  group: string;
  url: string;
}

interface LiveSource {
  key: string;
  name: string;
  url: string;
  ua?: string;
  epg?: string;
  from: 'config' | 'custom';
  channelNumber?: number;
  disabled?: boolean;
}

function LivePageClient() {
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<'loading' | 'fetching' | 'ready' | 'error'>('loading');
  const [loadingMessage, setLoadingMessage] = useState('正在加载直播源...');
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const [liveSources, setLiveSources] = useState<LiveSource[]>([]);
  const [currentSource, setCurrentSource] = useState<LiveSource | null>(null);
  const [currentChannels, setCurrentChannels] = useState<LiveChannel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<LiveChannel | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [groupedChannels, setGroupedChannels] = useState<{ [key: string]: LiveChannel[] }>({});
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredChannels, setFilteredChannels] = useState<LiveChannel[]>([]);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [isChannelListOpen, setIsChannelListOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 获取直播源列表
  const fetchLiveSources = useCallback(async () => {
    try {
      const resp = await fetch('/api/admin/live');
      if (resp.ok) {
        const data = await resp.json();
        setLiveSources(data.liveConfig || []);
      }
    } catch (err) {
      console.error('获取直播源失败:', err);
    }
  }, []);

  // 加载频道列表
  const loadChannels = useCallback(async (source: LiveSource) => {
    if (!source || source.disabled) return;

    try {
      setLoadingStage('fetching');
      setLoadingMessage(`正在加载 ${source.name}...`);

      const liveChannels: LiveChannels | null = await getCachedLiveChannels(source.key);

      if (liveChannels && liveChannels.channels.length > 0) {
        setCurrentChannels(liveChannels.channels);

        // 按分组
        const grouped: { [key: string]: LiveChannel[] } = {};
        liveChannels.channels.forEach(channel => {
          const group = channel.group || '未分组';
          if (!grouped[group]) {
            grouped[group] = [];
          }
          grouped[group].push(channel);
        });
        setGroupedChannels(grouped);

        // 默认选择第一个分组
        const firstGroup = Object.keys(grouped)[0];
        if (firstGroup) {
          setSelectedGroup(firstGroup);
        }

        setLoadingStage('ready');
        setError(null);
      } else {
        setError('该直播源暂无频道');
        setLoadingStage('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载频道失败');
      setLoadingStage('error');
    }
  }, []);

  // 初始化
  useEffect(() => {
    const init = async () => {
      await fetchLiveSources();
    };
    init();
  }, [fetchLiveSources]);

  // 当直播源加载完成后，加载默认源或指定源
  useEffect(() => {
    if (liveSources.length === 0) {
      setLoading(false);
      return;
    }

    const sourceKey = searchParams.get('source');
    const targetSource = sourceKey
      ? liveSources.find(s => s.key === sourceKey)
      : liveSources.find(s => !s.disabled);

    if (targetSource) {
      setCurrentSource(targetSource);
      loadChannels(targetSource);
    }
    setLoading(false);
  }, [liveSources, searchParams, loadChannels]);

  // 过滤频道
  useEffect(() => {
    if (!selectedGroup || !groupedChannels[selectedGroup]) {
      setFilteredChannels([]);
      return;
    }

    let channels = groupedChannels[selectedGroup];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      channels = channels.filter(channel =>
        channel.name.toLowerCase().includes(query) ||
        channel.group.toLowerCase().includes(query)
      );
    }

    setFilteredChannels(channels);
  }, [selectedGroup, groupedChannels, searchQuery]);

  // 刷新当前源的频道列表
  const handleRefresh = async () => {
    if (!currentSource || isRefreshing) return;

    setIsRefreshing(true);
    try {
      // 清除缓存
      const { deleteCachedLiveChannels } = await import('../../lib/live');
      deleteCachedLiveChannels(currentSource.key);
      await loadChannels(currentSource);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 切换直播源
  const handleSwitchSource = (source: LiveSource) => {
    setCurrentSource(source);
    setCurrentChannel(null);
    setVideoUrl('');
    setIsSourceMenuOpen(false);
    loadChannels(source);
  };

  // 播放频道
  const handlePlayChannel = (channel: LiveChannel) => {
    setCurrentChannel(channel);
    setVideoUrl(channel.url);
  };

  if (loading) {
    return (
      <PageLayout title="直播" showBack>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">加载中...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error && liveSources.length === 0) {
    return (
      <PageLayout title="直播" showBack>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Tv className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">{error || '暂无直播源'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="直播" showBack>
      <div className="flex flex-col h-full">
        {/* 顶部：视频播放器 */}
        <div className="relative bg-black">
          <div className="aspect-video max-h-[40vh] mx-auto">
            {videoUrl ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-900">
                <p className="text-white text-sm">播放器区域（请使用外部播放器）</p>
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  打开播放
                </a>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-900">
                <div className="text-center">
                  <Tv className="w-12 h-12 text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">选择一个频道开始播放</p>
                </div>
              </div>
            )}
          </div>

          {/* 当前播放信息 */}
          {currentChannel && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <p className="text-white font-medium">
                {currentChannel.logo && (
                  <img
                    src={currentChannel.logo}
                    alt=""
                    className="inline-block h-6 w-6 mr-2 object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                {currentChannel.name}
              </p>
              {currentChannel.group && (
                <p className="text-gray-300 text-xs">{currentChannel.group}</p>
              )}
            </div>
          )}
        </div>

        {/* 频道列表区域 */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 直播源选择和刷新 */}
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 p-3">
              {/* 直播源下拉选择 */}
              <div className="relative flex-1">
                <button
                  onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Radio className="w-4 h-4" />
                    {currentSource?.name || '选择直播源'}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isSourceMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isSourceMenuOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto z-20">
                    {liveSources.map(source => (
                      <button
                        key={source.key}
                        onClick={() => handleSwitchSource(source)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          source.key === currentSource?.key ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : ''
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span>{source.name}</span>
                          {source.disabled && (
                            <span className="text-xs text-red-500">已禁用</span>
                          )}
                        </span>
                        {source.channelNumber && (
                          <span className="text-xs text-gray-500">{source.channelNumber} 个频道</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 刷新按钮 */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || !currentSource}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>

              {/* 频道列表收起/展开 */}
              <button
                onClick={() => setIsChannelListOpen(!isChannelListOpen)}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronDown className={`w-5 h-5 transition-transform ${isChannelListOpen ? '' : '-rotate-90'}`} />
              </button>
            </div>

            {/* 频道列表展开时显示搜索和分组 */}
            {isChannelListOpen && (
              <>
                {/* 搜索框 */}
                <div className="px-3 pb-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索频道..."
                      className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
                    />
                  </div>
                </div>

                {/* 分组选择 */}
                <div className="px-3 pb-2 overflow-x-auto">
                  <div className="flex gap-2">
                    {Object.keys(groupedChannels).map(group => (
                      <button
                        key={group}
                        onClick={() => setSelectedGroup(group)}
                        className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                          selectedGroup === group
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {group} ({groupedChannels[group].length})
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 频道列表 */}
          {isChannelListOpen && (
            <div className="flex-1 overflow-y-auto p-3">
              {loadingStage === 'fetching' ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-gray-500">{loadingMessage}</p>
                  </div>
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-500 dark:text-gray-400">
                    {searchQuery ? '未找到匹配的频道' : '该分组暂无频道'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {filteredChannels.map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => handlePlayChannel(channel)}
                      className={`p-3 rounded-lg border transition-colors ${
                        currentChannel?.id === channel.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      {channel.logo ? (
                        <img
                          src={channel.logo}
                          alt=""
                          className="w-10 h-10 mx-auto mb-2 object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-10 h-10 mx-auto mb-2 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                          <Tv className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <p className="text-xs text-center truncate" title={channel.name}>
                        {channel.name}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default function LivePage() {
  return (
    <Suspense>
      <LivePageClient />
    </Suspense>
  );
}
