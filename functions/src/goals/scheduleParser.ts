/**
 * Schedule string parser for auto-pilot goals.
 *
 * Supported formats (case-insensitive, UTC):
 *   - "every 30m" | "every 5 minutes"
 *   - "every 2h" | "every 6 hours"
 *   - "every 1d" | "every 1 days"
 *   - "daily 08:30"
 *   - "weekly Mon 09:00"   (Mon|Tue|Wed|Thu|Fri|Sat|Sun)
 *   - "once"
 */

const MIN_INTERVAL_MS = 60 * 1000;
const DOW: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export interface ParsedSchedule {
  type: 'interval' | 'daily' | 'weekly' | 'once';
  intervalMs?: number;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
}

export function parseSchedule(input: string): ParsedSchedule {
  const s = input.trim().toLowerCase();

  if (s === 'once') return { type: 'once' };

  // every N (m|h|d) or every N (minutes|hours|days)
  const everyMatch = s.match(/^every\s+(\d+)\s*(m|h|d|minutes?|hours?|days?)$/);
  if (everyMatch) {
    const n = parseInt(everyMatch[1], 10);
    const unit = everyMatch[2][0]; // m, h, or d
    if (n <= 0) throw new Error('Interval must be positive');
    const ms = unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : n * 86_400_000;
    if (ms < MIN_INTERVAL_MS) throw new Error('Minimum interval is 1 minute');
    return { type: 'interval', intervalMs: ms };
  }

  const dailyMatch = s.match(/^daily\s+(\d{1,2}):(\d{2})$/);
  if (dailyMatch) {
    const hour = parseInt(dailyMatch[1], 10);
    const minute = parseInt(dailyMatch[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('Invalid time, expected HH:MM 0-23:0-59');
    }
    return { type: 'daily', hour, minute };
  }

  const weeklyMatch = s.match(/^weekly\s+(sun|mon|tue|wed|thu|fri|sat)\s+(\d{1,2}):(\d{2})$/);
  if (weeklyMatch) {
    const dayOfWeek = DOW[weeklyMatch[1]];
    const hour = parseInt(weeklyMatch[2], 10);
    const minute = parseInt(weeklyMatch[3], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('Invalid time, expected HH:MM 0-23:0-59');
    }
    return { type: 'weekly', dayOfWeek, hour, minute };
  }

  throw new Error(
    `Unrecognized schedule "${input}". Use "every Nm/h/d", "daily HH:MM", "weekly Mon HH:MM", or "once".`,
  );
}

/**
 * Get wall-clock components for a UTC instant inside a given IANA timezone.
 */
function getTzParts(tz: string, atUtcMs: number) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hour12: false,
  });
  const parts = fmt.formatToParts(new Date(atUtcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // 24:00 quirk on some platforms
  const dow = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
    dayOfWeek: dowMap[dow] ?? 0,
  };
}

/**
 * Convert a wall-clock time in the given timezone to its UTC milliseconds.
 * One-iteration probe — accurate except possibly across DST transitions
 * (off by at most 1 hour for the few minutes around the shift).
 */
function tzWallClockToUtcMs(tz: string, y: number, m: number, d: number, h: number, mi: number): number {
  const naiveUtc = Date.UTC(y, m - 1, d, h, mi, 0);
  const probe = getTzParts(tz, naiveUtc);
  const probeUtc = Date.UTC(probe.year, probe.month - 1, probe.day, probe.hour, probe.minute, 0);
  const offset = probeUtc - naiveUtc;
  return naiveUtc - offset;
}

/**
 * Compute the next run time strictly AFTER `from`.
 *
 * @param schedule - Schedule string ("every 15m", "daily 09:00", etc.)
 * @param from     - The reference instant (typically `now`).
 * @param hasRun   - Whether the goal has already run at least once. For "once"
 *                   schedules this controls whether to return a next run or null.
 * @param timezone - Optional IANA timezone for daily/weekly schedules. Defaults
 *                   to UTC.
 *
 * Returns null if the schedule is "once" and has already fired
 * (caller should mark the goal completed).
 */
export function computeNextRun(
  schedule: string,
  from: Date,
  hasRun: boolean,
  timezone?: string,
): Date | null {
  const parsed = parseSchedule(schedule);

  if (parsed.type === 'once') {
    return hasRun ? null : new Date(from);
  }

  if (parsed.type === 'interval') {
    return new Date(from.getTime() + (parsed.intervalMs as number));
  }

  const targetHour = parsed.hour as number;
  const targetMinute = parsed.minute as number;

  // daily / weekly in the goal's timezone (or UTC if not provided)
  if (timezone) {
    const local = getTzParts(timezone, from.getTime());
    let candidateMs = tzWallClockToUtcMs(
      timezone, local.year, local.month, local.day, targetHour, targetMinute,
    );

    if (parsed.type === 'daily') {
      if (candidateMs <= from.getTime()) {
        candidateMs = tzWallClockToUtcMs(
          timezone, local.year, local.month, local.day + 1, targetHour, targetMinute,
        );
      }
      return new Date(candidateMs);
    }

    // weekly
    const targetDow = parsed.dayOfWeek as number;
    let dayDiff = (targetDow - local.dayOfWeek + 7) % 7;
    if (dayDiff === 0 && candidateMs <= from.getTime()) dayDiff = 7;
    return new Date(tzWallClockToUtcMs(
      timezone, local.year, local.month, local.day + dayDiff, targetHour, targetMinute,
    ));
  }

  // UTC fallback
  const next = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
    targetHour, targetMinute, 0, 0,
  ));

  if (parsed.type === 'daily') {
    if (next.getTime() <= from.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  const targetDow = parsed.dayOfWeek as number;
  let dayDiff = (targetDow - next.getUTCDay() + 7) % 7;
  if (dayDiff === 0 && next.getTime() <= from.getTime()) dayDiff = 7;
  next.setUTCDate(next.getUTCDate() + dayDiff);
  return next;
}
