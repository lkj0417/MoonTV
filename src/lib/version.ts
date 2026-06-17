/* eslint-disable no-console */

const CURRENT_VERSION = '20260617234039';

// 版本检查状态枚举
export enum UpdateStatus {
  HAS_UPDATE = 'HAS_UPDATE',
  NO_UPDATE = 'NO_UPDATE',
  FETCH_FAILED = 'FETCH_FAILED',
}

// 检查更新函数
export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    const response = await fetch(
      'https://api.github.com/repos/lkj0417/MoonTV/releases/latest',
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    if (!response.ok) {
      return UpdateStatus.FETCH_FAILED;
    }

    const data = await response.json();
    const latestVersion = data.tag_name?.replace(/^v/, '') || '';

    if (!latestVersion) {
      return UpdateStatus.FETCH_FAILED;
    }

    // Compare versions
    const current = CURRENT_VERSION.split('.').map(Number);
    const latest = latestVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const curr = current[i] || 0;
      const lat = latest[i] || 0;

      if (lat > curr) {
        return UpdateStatus.HAS_UPDATE;
      }
      if (lat < curr) {
        return UpdateStatus.NO_UPDATE;
      }
    }

    return UpdateStatus.NO_UPDATE;
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return UpdateStatus.FETCH_FAILED;
  }
}

// 导出当前版本号供其他地方使用
export { CURRENT_VERSION };
