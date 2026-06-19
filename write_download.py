content = r'''\"use client\";

import { Download, Loader2 } from \"lucide-react\";
import { useState } from \"react\";

interface DownloadButtonProps {
  videoUrl: string;
  title: string;
  episode: number;
}

async function loadMuxJs(): Promise<unknown> {
  const win = window as unknown as Record<string, unknown>;
  if (win.muxjs) return win.muxjs;

  return new Promise((resolve, reject) => {
    const script = document.createElement(\"script\");
    script.src = \"https://cdn.jsdelivr.net/npm/mux.js@5.14.0/dist/mux.min.js\";
    script.onload = () => resolve((window as unknown as Record<string, unknown>).muxjs);
    script.onerror = () => reject(new Error(\"Failed to load mux.js\"));
    document.head.appendChild(script);
  });
}

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

  transmuxer.on(\"data\", (segment: { initSegment: Uint8Array; data: Uint8Array }) => {
    const data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
    data.set(segment.initSegment, 0);
    data.set(segment.data, segment.initSegment.byteLength);
    chunks.push(data);
  });

  transmuxer.push(tsData);
  transmuxer.flush();

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function parseM3U8(content: string, baseUrl: string): string[] {
  const lines = content.split(\"\\n\").map((l) => l.trim());
  const segments: string[] = [];
  let isMasterPlaylist = false;
  let mediaPlaylistUrl = \"\";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(\"#EXT-X-STREAM-INF\")) {
      isMasterPlaylist = true;
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith(\"#\")) {
        mediaPlaylistUrl = nextLine.startsWith(\"http\")
          ? nextLine
          : baseUrl + \"/\" + nextLine;
        break;
      }
    }
  }

  if (isMasterPlaylist && mediaPlaylistUrl) {
    throw new Error(\"MASTER_PLAYLIST:\" + mediaPlaylistUrl);
  }

  for (const line of lines) {
    if (line && !line.startsWith(\"#\")) {
      segments.push(line.startsWith(\"http\") ? line : baseUrl + \"/\" + line);
    }
  }

  return segments;
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (err) {
      if (i === retries - 1) throw err;
    }
  }
  throw new Error(\"Failed to fetch \" + url);
}

export default function DownloadButton({ videoUrl, title, episode }: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(\"\");

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setProgress(\"\\u89e3\\u6790\\u64ad\\u653e\\u5217\\u8868...\");

    try {
      const response = await fetchWithRetry(videoUrl);
      const m3u8Content = await response.text();
      const baseUrl = videoUrl.substring(0, videoUrl.lastIndexOf(\"/\"));

      let segmentUrls: string[];
      try {
        segmentUrls = parseM3U8(m3u8Content, baseUrl);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith(\"MASTER_PLAYLIST:\")) {
          const mediaUrl = err.message.split(\":\")[1];
          setProgress(\"\\u52a0\\u8f7d\\u5a92\\u4f53\\u64ad\\u653e\\u5217\\u8868...\");
          const mediaResponse = await fetchWithRetry(mediaUrl);
          const mediaContent = await mediaResponse.text();
          const mediaBaseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf(\"/\"));
          segmentUrls = parseM3U8(mediaContent, mediaBaseUrl);
        } else {
          throw err;
        }
      }

      if (segmentUrls.length === 0) {
        throw new Error(\"\\u672a\\u627e\\u5230\\u89c6\\u9891\\u7247\\u6bb5\");
      }

      const total = segmentUrls.length;
      const downloaded: Uint8Array[] = [];

      for (let i = 0; i < total; i++) {
        setProgress(\"\\u4e0b\\u8f7d\\u4e2d \" + (i + 1) + \"/\" + total + \"...\");
        const segResponse = await fetchWithRetry(segmentUrls[i]);
        const segBuffer = await segResponse.arrayBuffer();
        downloaded.push(new Uint8Array(segBuffer));
      }

      setProgress(\"\\u5408\\u5e76\\u89c6\\u9891...\");
      const totalLength = downloaded.reduce((acc, arr) => acc + arr.byteLength, 0);
      const mergedTs = new Uint8Array(totalLength);
      let offset = 0;
      for (const arr of downloaded) {
        mergedTs.set(arr, offset);
        offset += arr.byteLength;
      }

      setProgress(\"\\u8f6c\\u6362\\u4e3a MP4...\");
      let finalBlob: Blob;
      let ext: string;
      try {
        const mp4Data = await convertTsToMp4(mergedTs);
        finalBlob = new Blob([mp4Data], { type: \"video/mp4\" });
        ext = \"mp4\";
      } catch (convErr) {
        console.warn(\"TS to MP4 conversion failed, falling back to TS:\", convErr);
        finalBlob = new Blob([mergedTs], { type: \"video/mp2t\" });
        ext = \"ts\";
      }

      const safeTitle = title.replace(/[\\\\/:*?\"<>|]/g, \"_\");
      const filename = safeTitle + \" - \\u7b2c\" + episode + \"\\u96c6.\" + ext;

      const downloadUrl = URL.createObjectURL(finalBlob);
      const a = document.createElement(\"a\");
      a.href = downloadUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(downloadUrl);

      setProgress(\"\\u4e0b\\u8f7d\\u5b8c\\u6210\");
      setTimeout(() => setProgress(\"\"), 2000);
    } catch (err) {
      console.error(\"Download failed:\", err);
      setProgress(\"\\u4e0b\\u8f7d\\u5931\\u8d25\");
      setTimeout(() => setProgress(\"\"), 3000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className=\"flex items-center gap-2 px-3 py-1.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors\"
    >
      {downloading ? (
        <>
          <Loader2 className=\"w-4 h-4 animate-spin\" />
          <span>{progress}</span>
        </>
      ) : (
        <>
          <Download className=\"w-4 h-4\" />
          <span>\\u4e0b\\u8f7d</span>
        </>
      )}
    </button>
  );
}
'''

with open(r'E:\moontv\MoonTV\src\components\DownloadButton.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
