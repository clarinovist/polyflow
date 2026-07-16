/**
 * Validate attendance selfie URLs stored on AttendanceRecord.
 * Only internal R2 proxy paths are accepted — blocks external / spoofed URLs.
 *
 * Expected shape from uploadToR2 + buildAttendancePhotoKey:
 *   /api/images/{tenant}/attendance/{employeeId}/{filename}
 */

const ATTENDANCE_PHOTO_PATH =
  /^\/api\/images\/[a-zA-Z0-9_-]+\/attendance\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/;

export function isValidAttendancePhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim();
  if (!u) return false;
  // Absolute / protocol-relative URLs are never accepted
  if (/^https?:\/\//i.test(u) || u.startsWith('//')) return false;
  if (u.includes('..') || u.includes('\\') || u.includes('?') || u.includes('#')) return false;
  return ATTENDANCE_PHOTO_PATH.test(u);
}
