import { describe, it, expect } from "vitest";
import { parseLocalDate, formatLocalDate } from "./parse-local-date";

describe("parseLocalDate", () => {
  it("should parse yyyy-MM-dd as local midnight", () => {
    const d = parseLocalDate("2026-07-23");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July = 6
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("should not shift day for timezone-sensitive dates", () => {
    // "2026-01-01" should remain Jan 1, not Dec 31
    const d = parseLocalDate("2026-01-01");
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

describe("formatLocalDate", () => {
  it("should format date as yyyy-MM-dd", () => {
    const d = new Date(2026, 6, 23); // July 23, 2026 local
    expect(formatLocalDate(d)).toBe("2026-07-23");
  });

  it("should pad single-digit month and day", () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026
    expect(formatLocalDate(d)).toBe("2026-01-05");
  });
});
