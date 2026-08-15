/** Fallback when no timezone is stored (legacy series). */
export const SERIES_TIMEZONE = "UTC";

/** Browser / device local IANA timezone. */
export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || SERIES_TIMEZONE;
  } catch {
    return SERIES_TIMEZONE;
  }
}

/** Prefer the series-stored timezone; fall back to UTC (not UK-only). */
export function resolveSeriesTimezone(tz?: string | null): string {
  const t = (tz || "").trim();
  if (t) return t;
  return SERIES_TIMEZONE;
}

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

/**
 * Parse `datetime-local` value as wall time in `timeZone` → UTC.
 */
export function londonDatetimeLocalToUtc(
  datetimeLocal: string,
  timeZone: string = localTimezone(),
): Date {
  const m = datetimeLocal.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) {
    const d = new Date(datetimeLocal);
    if (Number.isNaN(d.getTime())) throw new Error("Invalid schedule date/time");
    return d;
  }
  return zonedWallTimeToUtc(
    timeZone,
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
}

/** Format a UTC Date as `YYYY-MM-DDTHH:mm` in `timeZone` for datetime-local inputs. */
export function toLondonDatetimeLocalValue(
  date: Date,
  timeZone: string = localTimezone(),
): string {
  const { year, month, day } = ymdInTimeZone(date, timeZone);
  const { hour, minute } = hmInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Human labels for schedule confirmation. */
export function formatScheduleLabels(
  utcDate: Date,
  timeZone: string = localTimezone(),
): {
  local: string;
  uk: string;
  utc: string;
} {
  const local = utcDate.toLocaleString(undefined, {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const utc = utcDate.toLocaleString(undefined, {
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
  return { local, uk: local, utc };
}

/** Build UTC instant from a calendar day + HH:mm in the given timezone. */
export function wallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  publishTime: string,
  timeZone: string = localTimezone(),
): string {
  const [hh, mm] = publishTime.split(":").map(Number);
  return zonedWallTimeToUtc(timeZone, year, month, day, hh || 0, mm || 0).toISOString();
}

/** @deprecated Use wallTimeToUtcIso */
export function londonWallToUtcIso(
  year: number,
  month: number,
  day: number,
  publishTime: string,
  timeZone: string = localTimezone(),
): string {
  return wallTimeToUtcIso(year, month, day, publishTime, timeZone);
}
