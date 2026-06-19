'use client';

import { Check, Download, Loader2, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { DownloadProgress, VideoDownloadManager } from '@/lib/download-manager';

interface DownloadButtonProps {
  videoUrl: string;
  title: string;
  episode: number;
}

type Status = 'idle' | 'preparing' | 'downloading' | 'completed' | 'error';

export default function DownloadButton({
  videoUrl,
  title,
  episode,
}: DownloadButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const managerRef = useRef<VideoDownloadManager | null>(null);

  const handleDownload = useCallback(async () => {
    if (!videoUrl) return;

    const manager = new VideoDownloadManager();
    managerRef.current = manager;
    setStatus('preparing');
    setProgress(null);
    setErrorMsg('');

    await manager.download({
      videoUrl,
      title,
      episode,
      onProgress: (p) => {
        setStatus('downloading');
        setProgress(p);
      },
      onError: (err) => {
        setStatus('error');
        setErrorMsg(err);
        setTimeout(() => setStatus('idle'), 4000);
      },
      onComplete: () => {
        setStatus('completed');
        setTimeout(() => setStatus('idle'), 3000);
      },
    });
  }, [videoUrl, title, episode]);

  const handleCancel = useCallback(() => {
    managerRef.current?.cancel();
    setStatus('idle');
    setProgress(null);
  }, []);

  if (!videoUrl) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (status === 'preparing') {
    return (
      <div className='flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400'>
        <Loader2 className='w-4 h-4 animate-spin' />
        <span>{'\u89E3\u6790\u89C6\u9891\u6E90...'}</span>
      </div>
    );
  }

  if (status === 'downloading' && progress) {
    return (
      <div className='space-y-1.5 w-full max-w-xs'>
        <div className='flex items-center justify-between text-xs text-gray-600 dark:text-gray-400'>
          <span>
            {progress.downloaded}/{progress.total} {'\u7247\u6BB5'}
          </span>
          <div className='flex items-center gap-2'>
            <span>
              {formatBytes(progress.downloadedBytes)}
              {progress.speed > 0 ? ` (${formatBytes(progress.speed)}/s)` : ''}
            </span>
            <button
              onClick={handleCancel}
              className='p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors'
              title={'\u53D6\u6D88\u4E0B\u8F7D'}
            >
              <X className='w-3.5 h-3.5' />
            </button>
          </div>
        </div>
        <div className='w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
          <div
            className='h-full bg-green-500 rounded-full transition-all duration-300'
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <div className='text-xs text-gray-500 dark:text-gray-400 text-right'>
          {progress.percentage}%
          {progress.remainingTime > 0 && (
            <span className='ml-1'>
              {'\u7EA6'} {progress.remainingTime}s
            </span>
          )}
        </div>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className='flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400'>
        <Check className='w-4 h-4' />
        <span>{'\u4E0B\u8F7D\u5B8C\u6210'}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <button
        onClick={handleDownload}
        className='flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition-colors'
        title={errorMsg}
      >
        <Download className='w-4 h-4' />
        <span className='max-w-[200px] truncate'>
          {errorMsg || '\u4E0B\u8F7D\u5931\u8D25'}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={handleDownload}
      className='flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800'
      title={'\u4E0B\u8F7D\u5F53\u524D\u89C6\u9891\u5230\u672C\u5730'}
    >
      <Download className='w-4 h-4' />
      <span>{'\u4E0B\u8F7D'}</span>
    </button>
  );
}
