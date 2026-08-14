import { describe, it, expect } from 'vitest';
import { isInQuietHours } from '../quiet-hours';

describe('isInQuietHours', () => {
  it('returns false when quiet hours are not configured', () => {
    expect(
      isInQuietHours(
        { quietHoursStart: null, quietHoursEnd: null },
        'Asia/Jakarta',
      ),
    ).toBe(false);
    expect(isInQuietHours(null, 'Asia/Jakarta')).toBe(false);
  });

  it('returns true within a same-day window', () => {
    const now = new Date('2026-08-01T01:00:00+07:00'); // 01:00 WIB
    expect(
      isInQuietHours(
        { quietHoursStart: 0, quietHoursEnd: 6 },
        'Asia/Jakarta',
        now,
      ),
    ).toBe(true);
  });

  it('returns false outside a same-day window', () => {
    const now = new Date('2026-08-01T08:00:00+07:00'); // 08:00 WIB
    expect(
      isInQuietHours(
        { quietHoursStart: 0, quietHoursEnd: 6 },
        'Asia/Jakarta',
        now,
      ),
    ).toBe(false);
  });

  it('handles an overnight window (e.g. 22 -> 6)', () => {
    const lateNight = new Date('2026-08-01T23:00:00+07:00'); // 23:00 WIB
    const earlyMorning = new Date('2026-08-01T03:00:00+07:00'); // 03:00 WIB
    const midday = new Date('2026-08-01T12:00:00+07:00'); // 12:00 WIB

    expect(
      isInQuietHours(
        { quietHoursStart: 22, quietHoursEnd: 6 },
        'Asia/Jakarta',
        lateNight,
      ),
    ).toBe(true);
    expect(
      isInQuietHours(
        { quietHoursStart: 22, quietHoursEnd: 6 },
        'Asia/Jakarta',
        earlyMorning,
      ),
    ).toBe(true);
    expect(
      isInQuietHours(
        { quietHoursStart: 22, quietHoursEnd: 6 },
        'Asia/Jakarta',
        midday,
      ),
    ).toBe(false);
  });

  it('treats quietHoursStart 0 as a real boundary, not falsy-absent (regression)', () => {
    const now = new Date('2026-08-01T03:00:00+07:00'); // 03:00 WIB
    expect(
      isInQuietHours(
        { quietHoursStart: 0, quietHoursEnd: 5 },
        'Asia/Jakarta',
        now,
      ),
    ).toBe(true);
  });
});
