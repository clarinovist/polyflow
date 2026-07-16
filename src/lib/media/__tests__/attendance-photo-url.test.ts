import { describe, it, expect } from 'vitest';
import { isValidAttendancePhotoUrl } from '../attendance-photo-url';

describe('isValidAttendancePhotoUrl', () => {
  it('accepts internal attendance R2 proxy paths', () => {
    expect(
      isValidAttendancePhotoUrl(
        '/api/images/kiyowo/attendance/emp-uuid-123/clock_in-1710000000.jpg',
      ),
    ).toBe(true);
    expect(
      isValidAttendancePhotoUrl(
        '/api/images/melindo/attendance/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clock_out-1.webp',
      ),
    ).toBe(true);
  });

  it('rejects external and absolute URLs', () => {
    expect(isValidAttendancePhotoUrl('https://evil.com/selfie.jpg')).toBe(false);
    expect(isValidAttendancePhotoUrl('http://cdn.example/x.jpg')).toBe(false);
    expect(isValidAttendancePhotoUrl('//evil.com/x.jpg')).toBe(false);
  });

  it('rejects wrong path shape', () => {
    expect(isValidAttendancePhotoUrl('/api/images/kiyowo/production/x/y.jpg')).toBe(false);
    expect(isValidAttendancePhotoUrl('/api/images/kiyowo/attendance/only-one-segment')).toBe(false);
    expect(isValidAttendancePhotoUrl('/uploads/selfie.jpg')).toBe(false);
    expect(isValidAttendancePhotoUrl('')).toBe(false);
    expect(isValidAttendancePhotoUrl(null)).toBe(false);
  });

  it('rejects path traversal / query injection', () => {
    expect(
      isValidAttendancePhotoUrl('/api/images/kiyowo/attendance/../secrets/x.jpg'),
    ).toBe(false);
    expect(
      isValidAttendancePhotoUrl('/api/images/kiyowo/attendance/emp/x.jpg?steal=1'),
    ).toBe(false);
  });
});
