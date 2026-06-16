/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Plus, Trash2, RefreshCw, Edit2, Save, X, Tv } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

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

interface LiveSourceConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const LiveSourceConfig = ({ config, refreshConfig }: LiveSourceConfigProps) => {
  const [liveSources, setLiveSources] = useState<LiveSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingSource, setEditingSource] = useState<LiveSource | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newSource, setNewSource] = useState<Partial<LiveSource>>({
    name: '',
    url: '',
    ua: '',
    epg: '',
  });
  const [isRefreshing, setIsRefreshing] = useState<string | null>(null);

  useEffect(() => {
    if (config?.LiveConfig) {
      setLiveSources(config.LiveConfig);
    }
  }, [config]);

  const handleAddSource = async () => {
    if (!newSource.name || !newSource.url) return;

    try {
      setIsLoading(true);

      const response = await fetch('/api/admin/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          source: {
            key: `custom-${Date.now()}`,
            name: newSource.name,
            url: newSource.url,
            ua: newSource.ua || '',
            epg: newSource.epg || '',
            from: 'custom',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('添加失败');
      }

      setIsAddingNew(false);
      setNewSource({ name: '', url: '', ua: '', epg: '' });
      await refreshConfig();
    } catch (error) {
      console.error('添加直播源失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSource = async (key: string) => {
    try {
      setIsLoading(true);

      const response = await fetch('/api/admin/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          key,
        }),
      });

      if (!response.ok) {
        throw new Error('删除失败');
      }

      await refreshConfig();
    } catch (error) {
      console.error('删除直播源失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleDisabled = async (key: string, disabled: boolean) => {
    try {
      const source = liveSources.find(s => s.key === key);
      if (!source) return;

      const response = await fetch('/api/admin/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          source: { ...source, disabled },
        }),
      });

      if (!response.ok) {
        throw new Error('更新失败');
      }

      await refreshConfig();
    } catch (error) {
      console.error('更新直播源失败:', error);
    }
  };

  const handleRefreshSource = async (key: string) => {
    try {
      setIsRefreshing(key);

      const response = await fetch('/api/admin/live/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        throw new Error('刷新失败');
      }

      await refreshConfig();
    } catch (error) {
      console.error('刷新直播源失败:', error);
    } finally {
      setIsRefreshing(null);
    }
  };

  const handleUpdateSource = async () => {
    if (!editingSource) return;

    try {
      setIsLoading(true);

      const response = await fetch('/api/admin/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          source: editingSource,
        }),
      });

      if (!response.ok) {
        throw new Error('更新失败');
      }

      setEditingSource(null);
      await refreshConfig();
    } catch (error) {
      console.error('更新直播源失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            直播源列表
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            共 {liveSources.length} 个直播源
          </p>
        </div>
        <button
          onClick={() => setIsAddingNew(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加
        </button>
      </div>

      {/* 添加新源表单 */}
      {isAddingNew && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="名称"
              value={newSource.name}
              onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            />
            <input
              type="url"
              placeholder="M3U URL"
              value={newSource.url}
              onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            />
            <input
              type="text"
              placeholder="User-Agent (可选)"
              value={newSource.ua || ''}
              onChange={(e) => setNewSource({ ...newSource, ua: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            />
            <input
              type="url"
              placeholder="EPG 节目单地址 (可选)"
              value={newSource.epg || ''}
              onChange={(e) => setNewSource({ ...newSource, epg: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsAddingNew(false);
                setNewSource({ name: '', url: '', ua: '', epg: '' });
              }}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleAddSource}
              disabled={!newSource.name || !newSource.url || isLoading}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 编辑源表单 */}
      {editingSource && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 space-y-3">
          <h5 className="text-sm font-medium text-blue-800 dark:text-blue-300">
            编辑直播源
          </h5>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="名称"
              value={editingSource.name}
              onChange={(e) => setEditingSource({ ...editingSource, name: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            />
            <input
              type="url"
              placeholder="M3U URL"
              value={editingSource.url}
              onChange={(e) => setEditingSource({ ...editingSource, url: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            />
            <input
              type="text"
              placeholder="User-Agent (可选)"
              value={editingSource.ua || ''}
              onChange={(e) => setEditingSource({ ...editingSource, ua: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            />
            <input
              type="url"
              placeholder="EPG 节目单地址 (可选)"
              value={editingSource.epg || ''}
              onChange={(e) => setEditingSource({ ...editingSource, epg: e.target.value })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditingSource(null)}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleUpdateSource}
              disabled={isLoading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 直播源列表 */}
      {liveSources.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Tv className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无直播源</p>
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  名称
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  频道数
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  状态
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {liveSources.map((source) => (
                <tr key={source.key} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {source.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                        {source.url}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {source.channelNumber || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleDisabled(source.key, !source.disabled)}
                      className={`px-2 py-1 text-xs rounded-full ${
                        source.disabled
                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                          : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                      }`}
                    >
                      {source.disabled ? '已禁用' : '启用'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleRefreshSource(source.key)}
                        disabled={isRefreshing === source.key || source.disabled}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                        title="刷新频道"
                      >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing === source.key ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => setEditingSource(source)}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSource(source.key)}
                        disabled={source.from === 'config'}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-30"
                        title={source.from === 'config' ? '内置源不可删除' : '删除'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LiveSourceConfig;
