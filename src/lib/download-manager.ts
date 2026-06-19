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
      onError?.('\u65E0\u6CD5\u83B7\u53D6\u89C6\u9891\u4FE1\u606F');
      return;
    }

    if (!manifestResponse.ok) {
      this._state = 'error';
      onError?.(
        '\u89C6\u9891\u6E90\u4E0D\u53EF\u7528\uFF0C\u8BF7\u6362\u6E90\u91CD\u8BD5'
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
      onError?.('\u89C6\u9891\u683C\u5F0F\u4E0D\u652F\u6301\u4E0B\u8F7D');
      return;
    }

    const segments: Array<{ url: string; byteRange?: string }> =
      manifestData.segments || [];
    const initSegment: { url: string; byteRange?: string } | undefined =
      manifestData.initSegment;

    if (segments.length === 0) {
      this._state = 'error';
      onError?.(
        '\u672A\u627E\u5230\u53EF\u4E0B\u8F7D\u7684\u89C6\u9891\u7247\u6BB5'
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
            `\u4E0B\u8F7D\u5931\u8D25: ${
              err instanceof Error ? err.message : '\u7F51\u7EDC\u9519\u8BEF'
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
    const ext = isFmp4 ? 'mp4' : 'ts';
    const blob = new Blob(blobParts, {
      type: isFmp4 ? 'video/mp4' : 'video/mp2t',
    });

    const filename = `${title} - \u7B2C${episode}\u96C6.${ext}`;
    triggerDownload(blob, filename);

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
