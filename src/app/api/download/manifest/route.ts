import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

function resolveUrl(baseUrl: string, relativeUrl: string): string {
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  const url = new URL(baseUrl);
  if (relativeUrl.startsWith('/')) {
    return url.origin + relativeUrl;
  }
  const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/') + 1);
  return url.origin + basePath + relativeUrl;
}

function parsePlaylist(text: string, baseUrl: string, blockAd = false) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let initSegment: { url: string; byteRange?: string } | undefined;
  const parsedSegments: Array<{
    url: string;
    byteRange?: string;
    duration: number;
  }> = [];

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
    } else if (line.startsWith('#EXT-X-BYTERANGE')) {
      const brMatch = line.match(/#EXT-X-BYTERANGE:(.+)/);
      if (brMatch) {
        currentByteRange = brMatch[1];
      }
    } else if (line.startsWith('#EXTINF')) {
      const durMatch = line.match(/#EXTINF:([\d.]+)/);
      const segDuration = durMatch ? parseFloat(durMatch[1]) : 0;
      if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
        parsedSegments.push({
          url: resolveUrl(baseUrl, lines[i + 1]),
          byteRange: currentByteRange,
          duration: segDuration,
        });
        currentByteRange = undefined;
      }
    }
  }

  let finalSegments = parsedSegments;

  if (blockAd && parsedSegments.length > 10) {
    // 终极去广告算法：完全基于 URL 模式特征提取
    // 浏览器之所以能去广告，是因为底层的解码器遇到断层的时间戳会自动丢弃切片。
    // 下载合并器(mux.js)没有容错会硬拼进去，所以我们通过静态特征在下载前斩断广告切片。
    const extractFeature = (urlStr: string) => {
      try {
        const u = new URL(urlStr);
        const pathParts = u.pathname.split('/');
        const filename = pathParts.pop() || '';
        const dir = u.host + pathParts.join('/');

        // 提取文件名前缀，移除所有数字
        const prefix = filename.replace(/\d+/g, '');
        return { dir, prefix, combined: dir + '|' + prefix };
      } catch (e) {
        return { dir: '', prefix: '', combined: urlStr };
      }
    };

    const featureCount = new Map<string, number>();
    for (const seg of parsedSegments) {
      const feat = extractFeature(seg.url).combined;
      featureCount.set(feat, (featureCount.get(feat) || 0) + 1);
    }

    let maxCount = 0;
    Array.from(featureCount.values()).forEach((count) => {
      if (count > maxCount) maxCount = count;
    });

    // 如果某个特征占比超过 50%，说明它是绝对的主力切片模式
    if (maxCount > parsedSegments.length * 0.5) {
      const validFeatures = new Set<string>();
      Array.from(featureCount.entries()).forEach(([feat, count]) => {
        // 容忍多段正片拼接的情况，门槛设为 5%
        if (count >= parsedSegments.length * 0.05) {
          validFeatures.add(feat);
        }
      });

      finalSegments = parsedSegments.filter((seg) => {
        const feat = extractFeature(seg.url).combined;
        return validFeatures.has(feat);
      });
    } else {
      // 退化策略：如果文件名纯随机没有规律，仅通过目录提取特征
      const dirCount = new Map<string, number>();
      for (const seg of parsedSegments) {
        const dir = extractFeature(seg.url).dir;
        dirCount.set(dir, (dirCount.get(dir) || 0) + 1);
      }

      let maxDirCount = 0;
      Array.from(dirCount.values()).forEach((count) => {
        if (count > maxDirCount) maxDirCount = count;
      });

      if (maxDirCount > parsedSegments.length * 0.5) {
        const validDirs = new Set<string>();
        Array.from(dirCount.entries()).forEach(([dir, count]) => {
          if (count >= parsedSegments.length * 0.05) {
            validDirs.add(dir);
          }
        });

        finalSegments = parsedSegments.filter((seg) => {
          const dir = extractFeature(seg.url).dir;
          return validDirs.has(dir);
        });
      }
    }
  }

  const finalDuration = finalSegments.reduce(
    (sum, seg) => sum + seg.duration,
    0
  );

  return {
    segments: finalSegments.map((s) => ({
      url: s.url,
      byteRange: s.byteRange,
    })),
    initSegment,
    duration: finalDuration,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');
  const blockAd = searchParams.get('blockAd') === 'true';

  if (!videoUrl) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  const fetchHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  };

  try {
    const response = await fetch(videoUrl, { headers: fetchHeaders });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch manifest' },
        { status: response.status }
      );
    }

    const text = await response.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (!lines[0]?.startsWith('#EXTM3U')) {
      return NextResponse.json(
        { error: 'Not a valid M3U8 file' },
        { status: 400 }
      );
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
        return NextResponse.json(
          { error: 'No stream found in master playlist' },
          { status: 400 }
        );
      }

      const mediaUrl = resolveUrl(videoUrl, bestUrl);
      const mediaResponse = await fetch(mediaUrl, { headers: fetchHeaders });

      if (!mediaResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch media playlist' },
          { status: mediaResponse.status }
        );
      }

      const mediaText = await mediaResponse.text();
      return NextResponse.json(parsePlaylist(mediaText, mediaUrl, blockAd));
    }

    return NextResponse.json(parsePlaylist(text, videoUrl, blockAd));
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to parse manifest',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
