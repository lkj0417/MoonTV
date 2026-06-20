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
    // 基于断点 (#EXT-X-DISCONTINUITY) 分组来过滤广告。
    // 黑产注入的广告通常会在前后加上断点，且其所在的组总时长非常短（如几秒到两三分钟）。
    // 我们找出时长最长的组作为主视频，并过滤掉那些明显过短的广告组。
    const sortedGroups = [...groups].sort(
      (a, b) => b.totalDuration - a.totalDuration
    );
    let mainGroup = sortedGroups[0];

    // 如果最长的组异常长（如大于 4 小时 = 14400秒），可能是黑产伪造的无限循环广告，我们尝试取第二长
    if (mainGroup.totalDuration > 14400 && sortedGroups.length > 1) {
      const plausibleGroups = sortedGroups.filter(
        (g) => g.totalDuration > 300 && g.totalDuration < 14400
      );
      if (plausibleGroups.length > 0) {
        mainGroup = plausibleGroups[0];
      }
    }

    for (const group of groups) {
      // 保留主视频组，或者与主视频组时长非常接近的组（例如被错误切断的上下集）
      // 抛弃所有时长过短的组（通常是赌场广告）
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

    // Fallback: 如果全都过滤光了，退回全部保留
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
