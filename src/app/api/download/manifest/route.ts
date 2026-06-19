/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'edge';

interface SegmentInfo {
  url: string;
  byteRange?: string;
}

interface VariantInfo {
  bandwidth: number;
  resolution?: string;
  uri: string;
}

interface MediaPlaylist {
  type: 'media';
  segments: SegmentInfo[];
  initSegment?: SegmentInfo;
  duration?: number;
}

interface MasterPlaylist {
  type: 'master';
  variants: VariantInfo[];
}

type ParsedPlaylist = MasterPlaylist | MediaPlaylist;

function resolveUrl(baseUrl: string, relativeUrl: string): string {
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch {
    return relativeUrl;
  }
}

function getBaseUrl(url: string): string {
  const lastSlash = url.lastIndexOf('/');
  return lastSlash >= 0 ? url.substring(0, lastSlash + 1) : url;
}

function parseMasterPlaylist(content: string, baseUrl: string): VariantInfo[] {
  const lines = content.split('\n');
  const variants: VariantInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      const resolutionMatch = line.match(/RESOLUTION=([^\s,]+)/);
      const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
      const resolution = resolutionMatch ? resolutionMatch[1] : undefined;

      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          variants.push({
            bandwidth,
            resolution,
            uri: resolveUrl(baseUrl, nextLine),
          });
          i++;
        }
      }
    }
  }

  return variants;
}

function parseMediaPlaylist(content: string, baseUrl: string): MediaPlaylist {
  const lines = content.split('\n');
  const segments: SegmentInfo[] = [];
  let initSegment: SegmentInfo | undefined;
  let totalDuration = 0;
  let pendingByteRange: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      if (durationMatch) {
        totalDuration += parseFloat(durationMatch[1]);
      }
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      const byteRangeMatch = line.match(/BYTERANGE="([^"]+)"/);
      if (uriMatch) {
        initSegment = {
          url: resolveUrl(baseUrl, uriMatch[1]),
          byteRange: byteRangeMatch ? byteRangeMatch[1] : undefined,
        };
      }
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      pendingByteRange = line.substring('#EXT-X-BYTERANGE:'.length);
    } else if (line && !line.startsWith('#')) {
      const seg: SegmentInfo = {
        url: resolveUrl(baseUrl, line),
      };
      if (pendingByteRange) {
        seg.byteRange = pendingByteRange;
        pendingByteRange = undefined;
      }
      segments.push(seg);
    }
  }

  return {
    type: 'media',
    segments,
    initSegment,
    duration: totalDuration,
  };
}

function parsePlaylist(content: string, baseUrl: string): ParsedPlaylist {
  if (content.includes('#EXT-X-STREAM-INF:')) {
    const variants = parseMasterPlaylist(content, baseUrl);
    if (variants.length > 0) {
      return { type: 'master', variants };
    }
  }
  return parseMediaPlaylist(content, baseUrl);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  try {
    const decodedUrl = decodeURIComponent(url);

    // Try to find matching source config for UA
    let ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    try {
      const config = await getConfig();
      if (config.SiteConfig?.UserAgent) {
        ua = config.SiteConfig.UserAgent;
      }
    } catch {
      // use default UA
    }

    // Fetch the manifest
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': ua,
        Accept: '*/*',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch manifest: ${response.status}` },
        { status: 502 }
      );
    }

    const content = await response.text();
    const finalUrl = response.url;
    const baseUrl = getBaseUrl(finalUrl);

    const parsed = parsePlaylist(content, baseUrl);

    if (parsed.type === 'master') {
      // Sort variants by bandwidth descending
      parsed.variants.sort((a, b) => b.bandwidth - a.bandwidth);

      // Fetch the highest quality variant
      const best = parsed.variants[0];
      const subResponse = await fetch(best.uri, {
        headers: { 'User-Agent': ua, Accept: '*/*' },
        redirect: 'follow',
      });

      if (!subResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch media playlist' },
          { status: 502 }
        );
      }

      const subContent = await subResponse.text();
      const subBaseUrl = getBaseUrl(subResponse.url);
      const mediaPlaylist = parseMediaPlaylist(subContent, subBaseUrl);

      return NextResponse.json({
        segments: mediaPlaylist.segments,
        initSegment: mediaPlaylist.initSegment,
        duration: mediaPlaylist.duration,
        qualities: parsed.variants.map((v) => ({
          bandwidth: v.bandwidth,
          resolution: v.resolution,
          uri: v.uri,
        })),
        selectedQuality: {
          bandwidth: best.bandwidth,
          resolution: best.resolution,
        },
      });
    }

    return NextResponse.json({
      segments: parsed.segments,
      initSegment: parsed.initSegment,
      duration: parsed.duration,
    });
  } catch (err: any) {
    console.error('Manifest fetch error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to parse manifest' },
      { status: 500 }
    );
  }
}
