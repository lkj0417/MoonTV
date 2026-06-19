'use client';

import { Download, Loader2 } from 'lucide-react';
import React, { useState } from 'react';

import { VideoDownloadManager } from '@/lib/download-manager';

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
  const [_progress, setProgress] = useState(0);

  const handleDownload = async () => {
    if (downloading || !videoUrl) return;

    setDownloading(true);
    setProgress(0);

    const downloader = new VideoDownloadManager();

    try {
      await downloader.download({
        videoUrl,
        title,
        episode,
        onProgress: (prog) => {
          setProgress(prog.percentage);
        },
        onComplete: () => {
          setDownloading(false);
          setProgress(100);
        },
        onError: () => {
          setDownloading(false);
          setProgress(0);
        },
      });
    } catch {
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className='ml-2 flex-shrink-0 hover:opacity-80 transition-opacity disabled:opacity-50'
      title={downloading ? 'Downloading...' : 'Download'}
    >
      {downloading ? (
        <div className='relative h-7 w-7'>
          <Loader2 className='h-7 w-7 animate-spin text-gray-600 dark:text-gray-300' />
        </div>
      ) : (
        <Download className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
      )}
    </button>
  );
}
