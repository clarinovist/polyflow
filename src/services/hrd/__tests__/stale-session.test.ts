import { describe, it, expect } from 'vitest';
import {
  STALE_SESSION_HOURS,
  isStaleOpenSession,
  staleSessionCutoff,
} from '../stale-session';

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-07-15T12:00:00.000Z');

describe('stale-session', () => {
  it('uses a 20 hour threshold', () => {
    expect(STALE_SESSION_HOURS).toBe(20);
  });

  describe('isStaleOpenSession', () => {
    it('is not stale at exactly 20 hours (strict boundary)', () => {
      const clockInAt = new Date(NOW.getTime() - 20 * HOUR_MS);
      expect(isStaleOpenSession({ clockInAt, clockOutAt: null }, NOW)).toBe(false);
    });

    it('is stale at 20 hours plus 1 ms', () => {
      const clockInAt = new Date(NOW.getTime() - 20 * HOUR_MS - 1);
      expect(isStaleOpenSession({ clockInAt, clockOutAt: null }, NOW)).toBe(true);
    });

    it('is not stale for a legitimate overnight session (4h open)', () => {
      const clockInAt = new Date(NOW.getTime() - 4 * HOUR_MS);
      expect(isStaleOpenSession({ clockInAt, clockOutAt: null }, NOW)).toBe(false);
    });

    it('is not stale when a clock-out exists, however old', () => {
      const clockInAt = new Date(NOW.getTime() - 72 * HOUR_MS);
      const clockOutAt = new Date(NOW.getTime() - 60 * HOUR_MS);
      expect(isStaleOpenSession({ clockInAt, clockOutAt }, NOW)).toBe(false);
    });

    it('is not stale when there is no clock-in', () => {
      expect(isStaleOpenSession({ clockInAt: null, clockOutAt: null }, NOW)).toBe(false);
    });

    it('does not mutate its inputs', () => {
      const clockInAt = new Date(NOW.getTime() - 30 * HOUR_MS);
      const before = clockInAt.getTime();
      isStaleOpenSession({ clockInAt, clockOutAt: null }, NOW);
      expect(clockInAt.getTime()).toBe(before);
      expect(NOW.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    });
  });

  describe('staleSessionCutoff', () => {
    it('returns now minus 20 hours as a new Date', () => {
      const cutoff = staleSessionCutoff(NOW);
      expect(cutoff.toISOString()).toBe('2026-07-14T16:00:00.000Z');
      expect(cutoff).not.toBe(NOW);
    });

    it('is consistent with isStaleOpenSession (clockInAt < cutoff <=> stale)', () => {
      const cutoff = staleSessionCutoff(NOW);
      const atCutoff = { clockInAt: cutoff, clockOutAt: null };
      const beforeCutoff = { clockInAt: new Date(cutoff.getTime() - 1), clockOutAt: null };
      expect(isStaleOpenSession(atCutoff, NOW)).toBe(false);
      expect(isStaleOpenSession(beforeCutoff, NOW)).toBe(true);
    });
  });
});
