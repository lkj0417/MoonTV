/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的订阅URL' },
        { status: 400 }
      );
    }

    // 验证URL格式
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'URL格式无效' }, { status: 400 });
    }

    // 仅支持 http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: '仅支持 http/https 协议' },
        { status: 400 }
      );
    }

    // 发送请求获取配置
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      },
      signal: AbortSignal.timeout(30000), // 30秒超时
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `获取配置失败: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // 获取响应内容
    const contentType = response.headers.get('content-type') || '';
    let configContent: string;

    if (contentType.includes('application/json')) {
      // JSON 格式直接返回
      configContent = await response.text();
    } else {
      // 其他格式当作文本处理
      configContent = await response.text();

      // 尝试解析为 JSON
      try {
        JSON.parse(configContent);
      } catch {
        // 检查是否 Base58 编码
        configContent = decodeBase58(configContent);
      }
    }

    // 验证配置内容是否为有效 JSON
    try {
      JSON.parse(configContent);
    } catch {
      return NextResponse.json(
        { error: '订阅配置内容不是有效的 JSON 格式' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      configContent,
      contentType,
    });
  } catch (error) {
    console.error('拉取订阅配置失败:', error);

    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        return NextResponse.json(
          { error: '请求超时，请检查网络或订阅地址' },
          { status: 408 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: '拉取配置失败' }, { status: 500 });
  }
}

// Base58 解码（用于解析 Base58 编码的配置文件）
function decodeBase58(encoded: string): string {
  // Base58 字符集
  const BASE58_ALPHABET =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  try {
    // 移除可能的空格和换行
    encoded = encoded.trim();

    let num = BigInt(0);
    const base = BigInt(58);

    // 将 Base58 字符转换为数字
    for (const char of encoded) {
      const index = BASE58_ALPHABET.indexOf(char);
      if (index === -1) {
        throw new Error(`非法字符: ${char}`);
      }
      num = num * base + BigInt(index);
    }

    // 将数字转换为字节数组
    const bytes: number[] = [];
    while (num > 0) {
      bytes.unshift(Number(num % BigInt(256)));
      num = num / BigInt(256);
    }

    // 添加前导零字节
    for (const char of encoded) {
      if (char === '1') {
        bytes.unshift(0);
      } else {
        break;
      }
    }

    // 转换为字符串
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch (error) {
    // 解码失败，返回原始内容
    console.error('Base58 解码失败:', error);
    return encoded;
  }
}
