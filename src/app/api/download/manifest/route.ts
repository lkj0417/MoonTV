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

  // Reconstruct all segments
  let allSegments = groups
    .flatMap((g) => g.segments)
    .map((s) => ({ url: s.url, byteRange: s.byteRange, duration: s.duration }));

  if (blockAd && allSegments.length > 10) {
    // 1. Group-based filtering (for ads separated by #EXT-X-DISCONTINUITY)
    if (groups.length > 1) {
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

      const validGroups = new Set<SegmentGroup>();
      for (const group of groups) {
        if (
          group === mainGroup ||
          (group.totalDuration > mainGroup.totalDuration * 0.5 &&
            group.totalDuration < mainGroup.totalDuration * 1.5)
        ) {
          validGroups.add(group);
        }
      }

      allSegments = groups
        .filter((g) => validGroups.has(g))
        .flatMap((g) => g.segments)
        .map((s) => ({
          url: s.url,
          byteRange: s.byteRange,
          duration: s.duration,
        }));
    }

    // 2. URL outlier detection (for ads injected without #EXT-X-DISCONTINUITY or missed by grouping)
    const dirCount = new Map<string, number>();
    for (const seg of allSegments) {
      try {
        const urlObj = new URL(seg.url);
        // Get directory path (e.g. host.com/path/to/)
        const dir =
          urlObj.host +
          urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/'));
        dirCount.set(dir, (dirCount.get(dir) || 0) + 1);
      } catch (e) {
        // ignore
      }
    }

    let maxCount = 0;
    Array.from(dirCount.values()).forEach((count) => {
      if (count > maxCount) maxCount = count;
    });

    // If there is a dominant directory (e.g. main video), filter out extreme minority directories (< 5% of segments)
    if (maxCount > allSegments.length * 0.5) {
      const validDirs = new Set<string>();
      Array.from(dirCount.entries()).forEach(([dir, count]) => {
        // A threshold of 5% is safe. Ads are usually just a few segments.
        if (count >= allSegments.length * 0.05) {
          validDirs.add(dir);
        }
      });

      const filteredByUrl = [];
      let tempDuration = 0;
      for (const seg of allSegments) {
        try {
          const urlObj = new URL(seg.url);
          const dir =
            urlObj.host +
            urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/'));
          if (validDirs.has(dir)) {
            filteredByUrl.push(seg);
            tempDuration += seg.duration;
          }
        } catch (e) {
          filteredByUrl.push(seg);
          tempDuration += seg.duration;
        }
      }

      // Fallback if we filtered too aggressively
      if (filteredByUrl.length > 0) {
        allSegments = filteredByUrl;
        finalDuration = tempDuration;
      }
    }

    // 3. Filename pattern outlier detection
    if (allSegments.length > 10) {
      const patternCount = new Map<string, number>();
      for (const seg of allSegments) {
        try {
          const urlObj = new URL(seg.url);
          const filename = urlObj.pathname.substring(
            urlObj.pathname.lastIndexOf('/') + 1
          );
          const pattern = filename.replace(/\d+/g, ''); // Extract pattern by removing numbers
          patternCount.set(pattern, (patternCount.get(pattern) || 0) + 1);
        } catch (e) {
          // ignore
        }
      }

      let maxPatternCount = 0;
      Array.from(patternCount.values()).forEach((count) => {
        if (count > maxPatternCount) maxPatternCount = count;
      });

      if (maxPatternCount > allSegments.length * 0.5) {
        const validPatterns = new Set<string>();
        Array.from(patternCount.entries()).forEach(([pattern, count]) => {
          if (count >= allSegments.length * 0.05) {
            validPatterns.add(pattern);
          }
        });

        const filteredByPattern = [];
        let tempDuration2 = 0;
        for (const seg of allSegments) {
          try {
            const urlObj = new URL(seg.url);
            const filename = urlObj.pathname.substring(
              urlObj.pathname.lastIndexOf('/') + 1
            );
            const pattern = filename.replace(/\d+/g, '');
            if (validPatterns.has(pattern)) {
              filteredByPattern.push(seg);
              tempDuration2 += seg.duration;
            }
          } catch (e) {
            filteredByPattern.push(seg);
            tempDuration2 += seg.duration;
          }
        }

        if (filteredByPattern.length > 0) {
          allSegments = filteredByPattern;
          finalDuration = tempDuration2;
        }
      }
    }
  }

  finalSegments = allSegments.map((s) => ({
    url: s.url,
    byteRange: s.byteRange,
  }));

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
