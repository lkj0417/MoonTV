/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  console.log(request.url);
  try {
    const config = await getConfig();

    if (!config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    // Filter out disabled live sources
    const liveSources = (config.LiveConfig || []).filter(
      (source) => !source.disabled
    );

    return NextResponse.json({
      success: true,
      data: liveSources,
    });
  } catch (error) {
    console.error('Failed to get live sources:', error);
    return NextResponse.json(
      { error: 'Failed to get live sources' },
      { status: 500 }
    );
  }
}
