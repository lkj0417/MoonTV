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

function parsePlaylist(text: string, baseUrl: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let initSegment: { url: string; byteRange?: string } | undefined;
  const segments: Array<{ url: string; byteRange?: string }> = [];
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
    } else if (line.startsWith('#EXT-X-BYTERANGE')) {
      const brMatch = line.match(/#EXT-X-BYTERANGE:(.+)/);
      if (brMatch) {
        currentByteRange = brMatch[1];
      }
    } else if (line.startsWith('#EXTINF')) {
      const durMatch = line.match(/#EXTINF:([\d.]+)/);
      if (durMatch) {
        duration += parseFloat(durMatch[1]);
      }
      if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
        segments.push({
          url: resolveUrl(baseUrl, lines[i + 1]),
          byteRange: currentByteRange,
        });
        currentByteRange = undefined;
      }
    }
  }

  return { segments, initSegment, duration };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

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
      return NextResponse.json(parsePlaylist(mediaText, mediaUrl));
    }

    return NextResponse.json(parsePlaylist(text, videoUrl));
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
