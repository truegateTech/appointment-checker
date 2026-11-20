const MADRID_TZ = "Europe/Madrid";

const WEEKDAY_START_MIN = 7 * 60 + 30; // 07:30
const WEEKEND_START_MIN = 9 * 60; // 09:00
const END_MIN = 22 * 60; // 22:00
const MAX_SLEEP_SLICE_MS = 30 * 60 * 1000; // Re-check clock every 30m max for DST safety

interface MadridTimeParts {
  dateKey: string; // YYYY-MM-DD in Europe/Madrid
  weekday: string; // Mon, Tue, ..., Sun
  hour: number;
  minute: number;
  second: number;
  isWeekend: boolean;
  totalMinutes: number;
}

const madridFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MADRID_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function getMadridTime(now = new Date()): MadridTimeParts {
  const parts = Object.fromEntries(
    madridFormatter.formatToParts(now).map((p) => [p.type, p.value]),
  );

  const weekday = parts.weekday ?? "Mon";
  const hour = Number(parts.hour ?? 0);
  const minute = Number(parts.minute ?? 0);
  const second = Number(parts.second ?? 0);
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    hour,
    minute,
    second,
    isWeekend,
    totalMinutes: hour * 60 + minute,
  };
}

export function getMadridDateKey(now = new Date()): string {
  return getMadridTime(now).dateKey;
}

export function getActiveWindowStatus(now = new Date()): {
  isActive: boolean;
  waitMs: number;
  reason: string;
} {
  const m = getMadridTime(now);
  const todayStartMin = m.isWeekend ? WEEKEND_START_MIN : WEEKDAY_START_MIN;

  if (m.totalMinutes >= todayStartMin && m.totalMinutes < END_MIN) {
    return { isActive: true, waitMs: 0, reason: "inside active window" };
  }

  if (m.totalMinutes < todayStartMin) {
    const minsLeft = todayStartMin - m.totalMinutes;
    const exactMs = Math.max(1_000, (minsLeft * 60 - m.second) * 1000);
    const openLabel = m.isWeekend ? "09:00" : "07:30";
    return {
      isActive: false,
      waitMs: Math.min(exactMs, MAX_SLEEP_SLICE_MS),
      reason: `Outside Madrid hours (${m.weekday} ${String(m.hour).padStart(2, "0")}:${String(m.minute).padStart(2, "0")}) — opens at ${openLabel} CET/CEST`,
    };
  }

  // Past 22:00 — calculate wait until tomorrow's opening
  const tomorrowIsWeekend = m.weekday === "Fri" || m.weekday === "Sat";
  const tomorrowStartMin = tomorrowIsWeekend
    ? WEEKEND_START_MIN
    : WEEKDAY_START_MIN;
  const minsUntilTomorrowOpen = 24 * 60 - m.totalMinutes + tomorrowStartMin;
  const exactMs = (minsUntilTomorrowOpen * 60 - m.second) * 1000;
  const openLabel = tomorrowIsWeekend ? "09:00" : "07:30";

  return {
    isActive: false,
    waitMs: Math.min(exactMs, MAX_SLEEP_SLICE_MS),
    reason: `Past 22:00 Madrid time — next window opens tomorrow at ${openLabel}`,
  };
}

export function getMsUntilNextMadridDay(now = new Date()): number {
  const m = getMadridTime(now);
  const tomorrowIsWeekend = m.weekday === "Fri" || m.weekday === "Sat";
  const tomorrowStartMin = tomorrowIsWeekend
    ? WEEKEND_START_MIN
    : WEEKDAY_START_MIN;
  const minsLeft = 24 * 60 - m.totalMinutes + tomorrowStartMin;
  const exactMs = Math.max(60_000, (minsLeft * 60 - m.second) * 1000);
  return Math.min(exactMs, MAX_SLEEP_SLICE_MS);
}
