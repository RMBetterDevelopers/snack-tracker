import { afterEach, describe, expect, it } from "vitest";
import { formatAbsoluteTime, formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-11-16T12:00:00.000Z");

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A date that lies `ms` milliseconds before NOW. */
function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("formatRelativeTime", () => {
  it.each([
    ["0 s", 0, "just now"],
    ["59 s", 59 * SECOND, "just now"],
    ["a future date", -5 * MINUTE, "just now"],
    ["60 s", 60 * SECOND, "1 minute ago"],
    ["59 min", 59 * MINUTE, "59 minutes ago"],
    ["60 min", 60 * MINUTE, "1 hour ago"],
    ["23 h 59 min", 23 * HOUR + 59 * MINUTE, "23 hours ago"],
    ["24 h", 24 * HOUR, "1 day ago"],
    ["47 h 59 min", 47 * HOUR + 59 * MINUTE, "1 day ago"],
    ["48 h", 48 * HOUR, "2 days ago"],
    ["29 days", 29 * DAY, "29 days ago"],
    ["30 days", 30 * DAY, "1 month ago"],
    ["364 days", 364 * DAY, "11 months ago"],
    ["365 days", 365 * DAY, "1 year ago"],
    ["730 days", 730 * DAY, "2 years ago"],
  ])("%s ago reads %j", (_label, elapsedMs, expected) => {
    expect(formatRelativeTime(ago(elapsedMs), NOW)).toBe(expected);
  });
});

describe("formatAbsoluteTime", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  // ICU may put a narrow no-break space (U+202F) before AM/PM, so match any whitespace there.
  const EXPECTED = /^Nov 14, 2026, 09:05\sAM UTC$/u;

  it("formats a fixed instant in UTC with a UTC label", () => {
    expect(formatAbsoluteTime(new Date("2026-11-14T09:05:00.000Z"))).toMatch(EXPECTED);
  });

  it("gives the same result whatever the process timezone is", () => {
    const instant = new Date("2026-11-14T09:05:00.000Z");
    const results = ["UTC", "Europe/Copenhagen", "America/Los_Angeles", "Asia/Tokyo"].map((tz) => {
      process.env.TZ = tz;
      return formatAbsoluteTime(instant);
    });

    expect(new Set(results).size).toBe(1);
    expect(results[0]).toMatch(EXPECTED);
  });
});
