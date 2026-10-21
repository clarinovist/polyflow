import { describe, it, expect, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: class {
        send = vi.fn();
    },
    PutObjectCommand: class {
        input: unknown;
        constructor(input: unknown) {
            this.input = input;
        }
    },
}));

import {
    contentFingerprint,
    buildProductionPhotoKey,
    buildAttendancePhotoKey,
    uploadToR2,
} from '../r2';

describe('contentFingerprint', () => {
    it('is a short, stable hash of the buffer', () => {
        const a = contentFingerprint(Buffer.from('same-bytes'));
        const b = contentFingerprint(Buffer.from('same-bytes'));
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{16}$/);
    });

    it('differs for different content', () => {
        expect(contentFingerprint(Buffer.from('one'))).not.toBe(
            contentFingerprint(Buffer.from('two')),
        );
    });
});

describe('idempotent object keys', () => {
    it('builds the same production key for a retried upload', () => {
        const buffer = Buffer.from('photo-bytes');
        const first = buildProductionPhotoKey('acme', 'exec-1', 'capture.jpg', contentFingerprint(buffer));
        const retry = buildProductionPhotoKey('acme', 'exec-1', 'capture.jpg', contentFingerprint(buffer));
        expect(retry).toBe(first);
        expect(first).toBe(`acme/production/exec-1/${contentFingerprint(buffer)}.jpg`);
    });

    it('keeps the timestamp form when no fingerprint is supplied', () => {
        const key = buildProductionPhotoKey('acme', 'exec-1', 'capture.jpg');
        expect(key).toMatch(/^acme\/production\/exec-1\/\d+\.jpg$/);
    });

    it('keeps the kind prefix on attendance keys', () => {
        const buffer = Buffer.from('selfie');
        const key = buildAttendancePhotoKey('globex', 'emp-1', 'clock_in', 'selfie.jpg', contentFingerprint(buffer));
        expect(key).toBe(`globex/attendance/emp-1/clock_in-${contentFingerprint(buffer)}.jpg`);
    });

    it('falls back to jpg when the filename has no extension', () => {
        expect(buildAttendancePhotoKey('globex', 'emp-1', 'clock_out', 'selfie', 'abc123')).toBe(
            'globex/attendance/emp-1/clock_out-abc123.jpg',
        );
    });
});

describe('uploadToR2', () => {
    it('returns the app proxy URL for a key', async () => {
        await expect(uploadToR2('acme/production/e/1.jpg', Buffer.from('x'), 'image/jpeg')).resolves.toBe(
            '/api/images/acme/production/e/1.jpg',
        );
    });
});
