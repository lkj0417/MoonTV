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
  let duration = 0;
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
      let segDuration = 0;
      if (durMatch) {
        segDuration = parseFloat(durMatch[1]);
        duration += segDuration;
      }
      if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
        const seg = {
          url: resolveUrl(baseUrl, lines[i + 1]),
          byteRange: currentByteRange,
          duration: segDuration,
        };
        groups[currentGroupIndex].segments.push(seg);
        groups[currentGroupIndex].totalDuration += segDuration;
        currentByteRange = undefined;
      }
    }
  }

  let finalSegments: Array<{ url: string; byteRange?: string }> = [];
  let finalDuration = duration;

  if (blockAd && groups.length > 1) {
    // Filter out ad groups:
    // Sometimes the ad is incredibly long (e.g., 13 hours of casino ads looped) or very short.
    // The main video is usually the one that has the most segments or a reasonable length (20-60 mins).
    // Let's identify the main group as the one that is closest to a typical video episode,
    // or simply the group with the most segments if it's a huge outlier.

    // Sort groups by duration to find the median or look at distribution
    const sortedGroups = [...groups].sort(
      (a, b) => b.totalDuration - a.totalDuration
    );

    // Assume the group with the most segments/duration that isn't a ridiculous outlier (like 13 hours = 46800s) is the main video.
    // Or, more simply: In anime/TV, the main video is usually 1200s - 3600s.
    // Ads are either very short (< 150s) or artificially looped to be huge (> 10000s).

    let mainGroup = sortedGroups[0];

    // If the longest group is absurdly long (e.g., > 4 hours = 14400s), maybe the second longest is the real video.
    if (mainGroup.totalDuration > 14400 && sortedGroups.length > 1) {
      const plausibleGroups = sortedGroups.filter(
        (g) => g.totalDuration > 300 && g.totalDuration < 14400
      );
      if (plausibleGroups.length > 0) {
        mainGroup = plausibleGroups[0];
      }
    }

    finalSegments = [];
    finalDuration = 0;

    for (const group of groups) {
      // Keep only groups that are reasonably close to the main group in duration, or keep ONLY the main group if there's a huge disparity.
      // Often in these m3u8s, there's exactly 1 main video and multiple small ads, or 1 main video and 1 huge looping ad.
      if (
        group === mainGroup ||
        (group.totalDuration > mainGroup.totalDuration * 0.7 &&
          group.totalDuration < mainGroup.totalDuration * 1.3)
      ) {
        finalSegments.push(
          ...group.segments.map((s) => ({ url: s.url, byteRange: s.byteRange }))
        );
        finalDuration += group.totalDuration;
      }
    }
    // Fallback if we accidentally filtered everything
    if (finalSegments.length === 0) {
      finalSegments = groups
        .flatMap((g) => g.segments)
        .map((s) => ({ url: s.url, byteRange: s.byteRange }));
      finalDuration = duration;
    }
  } else {
    finalSegments = groups
      .flatMap((g) => g.segments)
      .map((s) => ({ url: s.url, byteRange: s.byteRange }));
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
