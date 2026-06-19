// 动态加载mux.js
async function loadMuxJs(): Promise<unknown> {
  const win = window as unknown as Record<string, unknown>;
  if (win.muxjs) return win.muxjs;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mux.js@5.14.0/dist/mux.min.js';
    const win = window as unknown as Record<string, unknown>;
    script.onload = () => resolve(win.muxjs);
    script.onerror = () => reject(new Error('Failed to load mux.js'));
    document.head.appendChild(script);
  });
}

// TS到MP4转换
async function convertTsToMp4(tsData: Uint8Array): Promise<Uint8Array> {
  const muxjs = await loadMuxJs();
  const mux = muxjs as Record<string, Record<string, unknown>>;
  const Transmuxer = mux.mp4.Transmuxer as new () => {
    on: (
      event: string,
      handler: (segment: { initSegment: Uint8Array; data: Uint8Array }) => void
    ) => void;
    push: (data: Uint8Array) => void;
    flush: () => void;
  };
  const transmuxer = new Transmuxer();

  const chunks: Uint8Array[] = [];

  transmuxer.on(
    'data',
    (segment: { initSegment: Uint8Array; data: Uint8Array }) => {
      const data = new Uint8Array(
        segment.initSegment.byteLength + segment.data.byteLength
      );
      data.set(segment.initSegment, 0);
      data.set(segment.data, segment.initSegment.byteLength);
      chunks.push(data);
    }
  );

  transmuxer.push(tsData);
  transmuxer.flush();

  // 合并所有chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

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

export class VideoDownloadManager {
  private abortController: AbortController | null = null;
  private _state: DownloadState = 'idle';

  get state(): DownloadState {
    return this._state;
  }

  async download(options: DownloadOptions): Promise<void> {
    const { videoUrl, title, episode, onProgress, onError, onComplete } =
      options;

    this._state = 'preparing';
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const manifestUrl = `/api/download/manifest?url=${encodeURIComponent(
      videoUrl
    )}`;

    let manifestResponse: Response;
    try {
      manifestResponse = await fetch(manifestUrl, { signal });
    } catch (err) {
      if (signal.aborted) return;
      this._state = 'error';
      onError?.('\u65e0\u6cd5\u83b7\u53d6\u89c6\u9891\u4fe1\u606f');
      return;
    }

    if (!manifestResponse.ok) {
      this._state = 'error';
      onError?.(
        '\u89c6\u9891\u6e90\u4e0d\u53ef\u7528\uff0c\u8bf7\u6362\u6e90\u91cd\u8bd5'
      );
      return;
    }

    let manifestData: {
      segments?: Array<{ url: string; byteRange?: string }>;
      initSegment?: { url: string; byteRange?: string };
      duration?: number;
    };
    try {
      manifestData = await manifestResponse.json();
    } catch {
      this._state = 'error';
      onError?.('\u89c6\u9891\u683c\u5f0f\u4e0d\u652f\u6301\u4e0b\u8f7d');
      return;
    }

    const segments: Array<{ url: string; byteRange?: string }> =
      manifestData.segments || [];
    const initSegment: { url: string; byteRange?: string } | undefined =
      manifestData.initSegment;

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
      )}`;

      try {
        const res = await fetch(segUrl, { signal });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
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
        )}`;
        const res = await fetch(initUrl, { signal });
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
      // TS格式，尝试转换为MP4
      try {
        onProgress?.({
          downloaded: totalSegments,
          total: totalSegments,
          percentage: 100,
          downloadedBytes,
          speed: 0,
          remainingTime: 0,
        });

        // 合并所有TS片段
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

        // 转换为MP4
        const mp4Data = await convertTsToMp4(tsData);
        finalBlob = new Blob([mp4Data], { type: 'video/mp4' });
        ext = 'mp4';
      } catch (err) {
        // 转换失败，回退到TS格式
        // TS to MP4 conversion failed, falling back to TS format
        finalBlob = new Blob(blobParts, { type: 'video/mp2t' });
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
