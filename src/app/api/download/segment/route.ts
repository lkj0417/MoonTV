import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const segmentUrl = searchParams.get('url');

  if (!segmentUrl) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  try {
    const byteRange = searchParams.get('byteRange');
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    };

    if (byteRange) {
      const parts = byteRange.split('@');
      const length = parseInt(parts[0], 10);
      const offset = parts[1] ? parseInt(parts[1], 10) : 0;
      headers['Range'] = `bytes=${offset}-${offset + length - 1}`;
    }

    const response = await fetch(segmentUrl, { headers });

    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        { error: 'Failed to fetch segment' },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json(
        { error: 'Segment has no body' },
        { status: 500 }
      );
    }

    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';

    const respHeaders = new Headers();
    respHeaders.set('Content-Type', contentType);
    respHeaders.set('Cache-Control', 'public, max-age=86400');

    return new Response(response.body, {
      status: 200,
      headers: respHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to download segment',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
