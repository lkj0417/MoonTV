/**
 * Time format conversion functions
 * Handles formats like "20250824000000 +0800"
 */
export function parseCustomTimeFormat(timeStr: string): Date {
  // If already a standard format, return directly
  if (timeStr.includes('T') || timeStr.includes('-')) {
    return new Date(timeStr);
  }

  // Handle "20250824000000 +0800" format
  // Format: YYYYMMDDHHMMSS +ZZZZ
  const match = timeStr.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})$/
  );

  if (match) {
    const [, year, month, day, hour, minute, second, timezone] = match;

    // Create ISO format time string
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}${timezone}`;
    return new Date(isoString);
  }

  // If format doesn't match, try other common formats
  return new Date(timeStr);
}

/**
 * Format time to HH:MM format
 */
export function formatTimeToHHMM(timeString: string): string {
  try {
    const date = parseCustomTimeFormat(timeString);
    if (isNaN(date.getTime())) {
      return timeString; // If parsing fails, return original string
    }
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return timeString;
  }
}

/**
 * Check if time string is valid
 */
export function isValidTime(timeString: string): boolean {
  try {
    const date = parseCustomTimeFormat(timeString);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}
