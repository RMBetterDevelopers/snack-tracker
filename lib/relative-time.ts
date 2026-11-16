const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "always" });

// Do not combine dateStyle/timeStyle with timeZoneName: that combination throws.
const absoluteFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

/**
 * "just now", "5 minutes ago", "2 days ago", ...
 *
 * Based on elapsed time (`now - date`, rounded down), not calendar days, so
 * neither the server's nor the user's timezone affects the result.
 * Dates in the future (clock skew) count as "just now".
 */
export function formatRelativeTime(date: Date, now: Date): string {
  const elapsedMs = now.getTime() - date.getTime();

  if (elapsedMs < MINUTE_MS) {
    return "just now";
  }
  if (elapsedMs < HOUR_MS) {
    return relativeFormat.format(-Math.floor(elapsedMs / MINUTE_MS), "minute");
  }
  if (elapsedMs < DAY_MS) {
    return relativeFormat.format(-Math.floor(elapsedMs / HOUR_MS), "hour");
  }

  const days = Math.floor(elapsedMs / DAY_MS);
  if (days < 30) {
    return relativeFormat.format(-days, "day");
  }
  if (days < 365) {
    return relativeFormat.format(-Math.min(11, Math.floor(days / 30)), "month");
  }
  return relativeFormat.format(-Math.floor(days / 365), "year");
}

/** The exact time in UTC, e.g. "Nov 14, 2026, 09:05 AM UTC". */
export function formatAbsoluteTime(date: Date): string {
  return absoluteFormat.format(date);
}
