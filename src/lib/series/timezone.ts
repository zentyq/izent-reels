/** All Faceless Series schedules use UK time (Europe/London), including BST/GMT. */
export const SERIES_TIMEZONE = "Europe/London";

/** Offset of `timeZone` relative to UTC at `date` (ms). */
export function timeZoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/** Convert a wall-clock date/time in `timeZone` to a UTC Date. */
export function zonedWallTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const offset = timeZoneOffsetMs(timeZone, new Date(utc));
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }
  return new Date(utc);
}

export function ymdInTimeZone(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = dtf.format(date).split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function hmInTimeZone(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Always Europe/London for series scheduling (ignore stale UTC / browser TZ). */
export function resolveSeriesTimezone(_tz?: string | null): string {
  return SERIES_TIMEZONE;
}

/**
 * Parse `datetime-local` value as UK wall time → UTC ISO.
 * e.g. "2026-08-11T07:45" means 07:45 in London, not the browser OS timezone.
 */
export function londonDatetimeLocalToUtc(datetimeLocal: string): Date {
  const m = datetimeLocal.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) {
    const d = new Date(datetimeLocal);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid schedule date/time");
    return d;
  }
  return zonedWallTimeToUtc(
    SERIES_TIMEZONE,
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
}

/** Format a UTC Date as `YYYY-MM-DDTHH:mm` in Europe/London for datetime-local inputs. */
export function toLondonDatetimeLocalValue(date: Date): string {
  const { year, month, day } = ymdInTimeZone(date, SERIES_TIMEZONE);
  const { hour, minute } = hmInTimeZone(date, SERIES_TIMEZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Human labels for schedule confirmation. */
export function formatScheduleLabels(utcDate: Date): {
  uk: string;
  utc: string;
} {
  const uk = utcDate.toLocaleString("en-GB", {
    timeZone: SERIES_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const utc = utcDate.toLocaleString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  return { uk, utc };
}

/** Build UTC instant from a calendar day + HH:mm in London. */
export function londonWallToUtcIso(
  year: number,
  month: number,
  day: number,
  publishTime: string,
): string {
  const [hh, mm] = publishTime.split(":").map(Number);
  return zonedWallTimeToUtc(SERIES_TIMEZONE, year, month, day, hh || 0, mm || 0).toISOString();
}
