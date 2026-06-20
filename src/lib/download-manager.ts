export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
  downloadedBytes: number;
  speed: number;
  remainingTime: number;
}

export interface DownloadOptions {
  videoUrl: string;
  title: string;
  episode: number;
  blockAd?: boolean;
  onProgress?: (progress: DownloadProgress) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

type DownloadState =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'completed'
  | 'error'
  | 'cancelled';

// ---------------- 客户端备用 HLS 直连解析器 ----------------
function resolveUrl(baseUrl: string, relativeUrl: string): string {
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  try {
    const url = new URL(baseUrl);
    if (relativeUrl.startsWith('/')) {
      return url.origin + relativeUrl;
    }
    const basePath = url.pathname.substring(
      0,
      url.pathname.lastIndexOf('/') + 1
    );
    return url.origin + basePath + relativeUrl;
  } catch {
    return relativeUrl;
  }
}

function parsePlaylist(text: string, baseUrl: string, blockAd = false) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let initSegment: { url: string; byteRange?: string } | undefined;

  interface SegmentGroup {
    segments: Array<{ url: string; byteRange?: string; duration: number }>;
    totalDuration: number;
  }

  const groups: SegmentGroup[] = [{ segments: [], totalDuration: 0 }];
  let currentGroupIndex = 0;
  let currentByteRange: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-MAP')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      const brMatch = line.match(/BYTERANGE="([^"]+)"/);
      if (uriMatch) {
        initSegment = {
          url: resolveUrl(baseUrl, uriMatch[1]),
          byteRange: brMatch ? brMatch[1] : undefined,
        };
      }
    } else if (line.startsWith('#EXT-X-DISCONTINUITY')) {
      if (groups[currentGroupIndex].segments.length > 0) {
        groups.push({ segments: [], totalDuration: 0 });
        currentGroupIndex++;
      }
    } else if (line.startsWith('#EXT-X-BYTERANGE')) {
      const brMatch = line.match(/#EXT-X-BYTERANGE:(.+)/);
      if (brMatch) {
        currentByteRange = brMatch[1];
      }
    } else if (line.startsWith('#EXTINF')) {
      const durMatch = line.match(/#EXTINF:([\d.]+)/);
      const segDuration = durMatch ? parseFloat(durMatch[1]) : 0;
      if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
        groups[currentGroupIndex].segments.push({
          url: resolveUrl(baseUrl, lines[i + 1]),
          byteRange: currentByteRange,
          duration: segDuration,
        });
        groups[currentGroupIndex].totalDuration += segDuration;
        currentByteRange = undefined;
      }
    }
  }

  let finalSegments: Array<{ url: string; byteRange?: string }> = [];
  let finalDuration = 0;

  if (blockAd && groups.length > 1) {
    const sortedGroups = [...groups].sort(
      (a, b) => b.totalDuration - a.totalDuration
    );
    let mainGroup = sortedGroups[0];

    if (mainGroup.totalDuration > 14400 && sortedGroups.length > 1) {
      const plausibleGroups = sortedGroups.filter(
        (g) => g.totalDuration > 300 && g.totalDuration < 14400
      );
      if (plausibleGroups.length > 0) {
        mainGroup = plausibleGroups[0];
      }
    }

    for (const group of groups) {
      if (
        group === mainGroup ||
        group.totalDuration > mainGroup.totalDuration * 0.5
      ) {
        finalSegments.push(
          ...group.segments.map((s) => ({ url: s.url, byteRange: s.byteRange }))
        );
        finalDuration += group.totalDuration;
      }
    }

    if (finalSegments.length === 0) {
      finalSegments = groups
        .flatMap((g) => g.segments)
        .map((s) => ({ url: s.url, byteRange: s.byteRange }));
      finalDuration = groups.reduce((acc, g) => acc + g.totalDuration, 0);
    }
  } else {
    finalSegments = groups
      .flatMap((g) => g.segments)
      .map((s) => ({ url: s.url, byteRange: s.byteRange }));
    finalDuration = groups.reduce((acc, g) => acc + g.totalDuration, 0);
  }

  return { segments: finalSegments, initSegment, duration: finalDuration };
}

async function fetchAndParseManifestClientSide(
  videoUrl: string,
  blockAd = false
): Promise<{
  segments: Array<{ url: string; byteRange?: string }>;
  initSegment?: { url: string; byteRange?: string };
  duration: number;
}> {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines[0]?.startsWith('#EXTM3U')) {
    throw new Error('Not a valid M3U8 file');
  }

  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));

  if (isMaster) {
    let bestUrl = '';
    let bestBandwidth = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
        const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
        if (bw >= bestBandwidth && i + 1 < lines.length) {
          bestBandwidth = bw;
          bestUrl = lines[i + 1];
        }
      }
    }

    if (!bestUrl) {
      throw new Error('No stream found in master playlist');
    }

    const mediaUrl = resolveUrl(videoUrl, bestUrl);
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      throw new Error(`HTTP ${mediaResponse.status}`);
    }
    const mediaText = await mediaResponse.text();
    return parsePlaylist(mediaText, mediaUrl, blockAd);
  }

  return parsePlaylist(text, videoUrl, blockAd);
}

export class VideoDownloadManager {
  private abortController: AbortController | null = null;
  private _state: DownloadState = 'idle';

  get state(): DownloadState {
    return this._state;
  }

  async download(options: DownloadOptions): Promise<void> {
    const {
      videoUrl,
      title,
      episode,
      blockAd,
      onProgress,
      onError,
      onComplete,
    } = options;

    this._state = 'preparing';
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const manifestUrl = `/api/download/manifest?url=${encodeURIComponent(
      videoUrl
    )}${blockAd ? '&blockAd=true' : ''}`;

    let manifestData: {
      segments?: Array<{ url: string; byteRange?: string }>;
      initSegment?: { url: string; byteRange?: string };
      duration?: number;
    } | null = null;

    try {
      const manifestResponse = await fetch(manifestUrl, { signal });
      if (manifestResponse.ok) {
        manifestData = await manifestResponse.json();
      }
    } catch (err) {
      // 捕获异常，准备进入浏览器直连 fallback
    }

    if (!manifestData) {
      // 备用方案：如果服务端下载解析 API 报错（例如服务器 IP 被视频资源站屏蔽），则尝试直接由浏览器发起跨域直连下载解析
      // eslint-disable-next-line no-console
      console.warn(
        '服务端获取 M3U8 列表失败（可能是服务器 IP 被对方屏蔽），正在尝试浏览器直连解析...',
        videoUrl
      );
      try {
        manifestData = await fetchAndParseManifestClientSide(videoUrl, blockAd);
      } catch (clientErr) {
        if (signal.aborted) return;
        this._state = 'error';
        // eslint-disable-next-line no-console
        console.error(
          '浏览器直连解析也失败（通常由于跨域策略限制）:',
          clientErr
        );
        onError?.(
          '\u89c6\u9891\u6e90\u4e0d\u53ef\u7528\uff0c\u8bf7\u6362\u6e90\u91cd\u8bd5'
        );
        return;
      }
    }

    const segments: Array<{ url: string; byteRange?: string }> =
      manifestData?.segments || [];
    const initSegment: { url: string; byteRange?: string } | undefined =
      manifestData?.initSegment;

    if (segments.length === 0) {
      this._state = 'error';
      onError?.(
        '\u672a\u627e\u5230\u53ef\u4e0b\u8f7d\u7684\u89c6\u9891\u7247\u6bb5'
      );
      return;
    }

    this._state = 'downloading';
    const totalSegments = segments.length;
    const segmentData: (Uint8Array | null)[] = new Array(totalSegments).fill(
      null
    );
    let downloadedSegments = 0;
    let downloadedBytes = 0;
    const startTime = Date.now();

    const concurrency = 6;
    let nextIndex = 0;
    let hasError = false;

    const downloadSegment = async (index: number): Promise<void> => {
      if (hasError || signal.aborted) return;

      const segment = segments[index];
      const segUrl = `/api/download/segment?url=${encodeURIComponent(
        segment.url
      )}${
        segment.byteRange
          ? `&byteRange=${encodeURIComponent(segment.byteRange)}`
          : ''
      }`;

      try {
        let res = await fetch(segUrl, { signal });
        if (!res.ok) {
          // 备用方案：如果服务端分片下载代理失败（如 Cloudflare Edge 被防火墙屏蔽），尝试由浏览器客户端发起跨域直连下载
          const headers: Record<string, string> = {};
          if (segment.byteRange) {
            headers['Range'] = `bytes=${segment.byteRange}`;
          }
          res = await fetch(segment.url, { signal, headers });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
        }
        const data = new Uint8Array(await res.arrayBuffer());
        segmentData[index] = data;

        downloadedSegments++;
        downloadedBytes += data.byteLength;

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;
        const remaining =
          speed > 0
            ? (totalSegments - downloadedSegments) /
              (downloadedSegments / elapsed)
            : 0;

        onProgress?.({
          downloaded: downloadedSegments,
          total: totalSegments,
          percentage: Math.round((downloadedSegments / totalSegments) * 100),
          downloadedBytes,
          speed,
          remainingTime: Math.round(remaining),
        });
      } catch (err) {
        if (!signal.aborted) {
          hasError = true;
          this._state = 'error';
          onError?.(
            `\u4e0b\u8f7d\u5931\u8d25: ${
              err instanceof Error ? err.message : '\u7f51\u7edc\u9519\u8bef'
            }`
          );
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(concurrency, totalSegments); w++) {
      workers.push(
        (async () => {
          while (nextIndex < totalSegments && !hasError && !signal.aborted) {
            const idx = nextIndex++;
            await downloadSegment(idx);
          }
        })()
      );
    }

    await Promise.all(workers);

    if (hasError || signal.aborted) {
      if (signal.aborted) {
        this._state = 'cancelled';
      }
      return;
    }

    let initData: Uint8Array | null = null;
    if (initSegment) {
      try {
        const initUrl = `/api/download/segment?url=${encodeURIComponent(
          initSegment.url
        )}${
          initSegment.byteRange
            ? `&byteRange=${encodeURIComponent(initSegment.byteRange)}`
            : ''
        }`;
        let res = await fetch(initUrl, { signal });
        if (!res.ok) {
          const headers: Record<string, string> = {};
          if (initSegment.byteRange) {
            headers['Range'] = `bytes=${initSegment.byteRange}`;
          }
          res = await fetch(initSegment.url, { signal, headers });
        }
        if (res.ok) {
          initData = new Uint8Array(await res.arrayBuffer());
        }
      } catch {
        // init segment optional for TS streams
      }
    }

    this._state = 'preparing';

    const blobParts: Uint8Array[] = [];
    if (initData) {
      blobParts.push(initData);
    }

    // 终极去广告算法第二层：文件物理体积异常检测 (Outlier Detection)
    // 很多恶性赌场广告是直接在相同 URL 路径下替换了 .ts 文件，且完全没有打 #EXT-X-DISCONTINUITY 标签。
    // 这种情况下 manifest 层无法防御。
    // 但因为广告是由不同压制组/不同编码器生成的，其文件码率、分辨率和内容与正常动漫正片完全不同，
    // 导致广告片段的 .ts 文件大小会与正常的切片文件大小产生“巨大断层”（要么极大，要么极小）。
    if (options.blockAd && totalSegments > 10) {
      const sizes = segmentData
        .map((d) => (d ? d.byteLength : 0))
        .filter((s) => s > 0);
      sizes.sort((a, b) => a - b);
      const medianSize = sizes[Math.floor(sizes.length / 2)];

      let filteredCount = 0;
      for (let i = 0; i < segmentData.length; i++) {
        const data = segmentData[i];
        if (data) {
          // 允许视频最后几个切片体积较小（因为通常是不满 4 秒的结尾）
          const isTail = i >= segmentData.length - 3;
          // 头几个切片可能有额外的头部信息，放宽一点下限
          const isHead = i <= 2;

          // 如果切片体积大于中位数的 2.5 倍，或者远远小于中位数，判定为恶意注入广告并直接丢弃
          if (
            data.byteLength > medianSize * 2.5 ||
            (!isTail && !isHead && data.byteLength < medianSize * 0.2)
          ) {
            // eslint-disable-next-line no-console
            console.warn(
              `[BlockAd] 拦截异常切片 #${i}: 体积 ${data.byteLength} bytes (中位数 ${medianSize})`
            );
            segmentData[i] = null;
            filteredCount++;
          }
        }
      }
      if (filteredCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`[BlockAd] 共拦截并清理了 ${filteredCount} 个异常广告切片`);
      }
    }

    for (const data of segmentData) {
      if (data) blobParts.push(data);
    }

    const isFmp4 = !!initData;

    let finalBlob: Blob;
    let ext: string;

    if (isFmp4) {
      // 已经是fMP4格式
      finalBlob = new Blob(blobParts, { type: 'video/mp4' });
      ext = 'mp4';
    } else {
      // TS格式，尝试使用原生的 mp4 转换
      onProgress?.({
        downloaded: totalSegments,
        total: totalSegments,
        percentage: 95, // 留 5% 给本地转换
        downloadedBytes,
        speed: 0,
        remainingTime: 0,
      });

      const tsTotalLength = blobParts.reduce(
        (acc, part) => acc + part.byteLength,
        0
      );
      const tsData = new Uint8Array(tsTotalLength);
      let offset = 0;
      for (const part of blobParts) {
        tsData.set(part, offset);
        offset += part.byteLength;
      }

      try {
        // 通过原生的 Blob 和 MediaRecorder 处理，或者通过动态载入 ffmpeg.wasm 来处理
        // 考虑到在前端完全安全地转复用 TS 到 MP4 且保持音画同步，目前唯一不丢帧、不坏时间戳的完美方案是 FFmpeg.wasm。
        // 为了不增加首次页面加载负担，我们在这里动态引入。
        onProgress?.({
          downloaded: totalSegments,
          total: totalSegments,
          percentage: 98,
          downloadedBytes,
          speed: 0,
          remainingTime: 0,
        });

        const { FFmpeg } = await import('@ffmpeg/ffmpeg');

        const ffmpeg = new FFmpeg();

        // 捕获日志（可选）
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        ffmpeg.on('log', () => {});

        // 设置 5 秒加载超时保护，防止 unpkg 挂起或 Cloudflare CDN 代理拦截 Web Worker 导致的线程挂起死锁
        const loadWithTimeout = async () => {
          try {
            await ffmpeg.load({
              coreURL:
                'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
              wasmURL:
                'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
            });
          } catch (loadErr) {
            // eslint-disable-next-line no-console
            console.warn(
              '从 unpkg 加载 FFmpeg 失败，尝试备用淘宝镜像',
              loadErr
            );
            await ffmpeg.load({
              coreURL:
                'https://registry.npmmirror.com/@ffmpeg/core/0.12.6/files/dist/umd/ffmpeg-core.js',
              wasmURL:
                'https://registry.npmmirror.com/@ffmpeg/core/0.12.6/files/dist/umd/ffmpeg-core.wasm',
            });
          }
        };

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('FFmpeg 加载超时（5s）')), 5000)
        );

        await Promise.race([loadWithTimeout(), timeoutPromise]);

        const inputName = 'input.ts';
        const outputName = 'output.mp4';

        await ffmpeg.writeFile(inputName, tsData);

        // 仅仅是容器转换（复用，不重新编码，极快且无损）
        await ffmpeg.exec(['-i', inputName, '-c', 'copy', outputName]);

        const mp4Data = await ffmpeg.readFile(outputName);
        finalBlob = new Blob([mp4Data], { type: 'video/mp4' });
        ext = 'mp4';

        // 释放内存
        ffmpeg.terminate();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('FFmpeg 转换失败，退回为 TS 格式保存', err);
        finalBlob = new Blob([tsData], { type: 'video/mp2t' });
        ext = 'ts';
      }
    }

    const filename = `${title} - \u7b2c${episode}\u96c6.${ext}`;
    triggerDownload(finalBlob, filename);

    this._state = 'completed';
    onComplete?.();
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
    this._state = 'cancelled';
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
