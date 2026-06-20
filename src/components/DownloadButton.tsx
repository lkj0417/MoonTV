'use client';

import { Download, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { DownloadProgress, VideoDownloadManager } from '@/lib/download-manager';

interface DownloadButtonProps {
  videoUrl: string;
  title: string;
  episode: number;
}

export default function DownloadButton({
  videoUrl,
  title,
  episode,
}: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const managerRef = useRef<VideoDownloadManager | null>(null);

  // 组件卸载时取消下载
  useEffect(() => {
    return () => {
      if (managerRef.current && managerRef.current.state === 'downloading') {
        managerRef.current.cancel();
      }
    };
  }, []);

  const handleDownload = async () => {
    if (downloading) {
      // 允许点击取消
      if (managerRef.current) {
        managerRef.current.cancel();
        setProgressText('已取消');
        setTimeout(() => {
          setDownloading(false);
          setProgressText('');
        }, 2000);
      }
      return;
    }

    setDownloading(true);
    setProgressText('准备下载...');

    const manager = new VideoDownloadManager();
    managerRef.current = manager;

    try {
      await manager.download({
        videoUrl,
        title,
        episode,
        onProgress: (progress: DownloadProgress) => {
          setProgressText(
            `下载中 ${progress.percentage}% (${progress.downloaded}/${progress.total})`
          );
        },
        onError: (err: string) => {
          setProgressText(err);
          setTimeout(() => {
            setDownloading(false);
            setProgressText('');
          }, 3000);
        },
        onComplete: () => {
          setProgressText('下载完成');
          setTimeout(() => {
            setDownloading(false);
            setProgressText('');
          }, 3000);
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Download failed:', err);
      setProgressText('下载失败');
      setTimeout(() => {
        setDownloading(false);
        setProgressText('');
      }, 3000);
    }
  };

  return (
    <button
      onClick={handleDownload}
      className='flex items-center gap-2 px-3 py-1.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 text-sm font-medium transition-colors'
      title={downloading ? '点击取消下载' : '下载视频'}
    >
      {downloading ? (
        <>
          <Loader2 className='w-4 h-4 animate-spin' />
          <span>{progressText}</span>
          <XCircle className='w-4 h-4 ml-1 opacity-70 hover:opacity-100' />
        </>
      ) : (
        <>
          <Download className='w-4 h-4' />
          <span>下载</span>
        </>
      )}
    </button>
  );
}
