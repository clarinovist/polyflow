import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function jsonRes(body: unknown, ok = true, status = 200, ct = 'application/json') {
    return {
        ok,
        status,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? ct : null) },
        text: async () => JSON.stringify(body),
    };
}
function htmlRes(html: string, ok = true, status = 200, ct = 'text/html') {
    return {
        ok,
        status,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? ct : null) },
        text: async () => html,
    };
}

describe('uploadSelfie / uploadSelfieWithRetry', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('success returns url, fetch called once', async () => {
        fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
            jsonRes({ success: true, publicUrl: '/x.jpg' }) as any,
        );
        const { uploadSelfie } = await import('../AttendanceKioskForm');
        const result = await uploadSelfie(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), 'emp-1', 'clock_in');
        expect(result).toEqual({ url: '/x.jpg' });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('JSON error response (4xx) returns error message, no retry', async () => {
        fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
            jsonRes({ error: 'Employee not found or inactive' }, false, 404) as any,
        );
        const { uploadSelfie } = await import('../AttendanceKioskForm');
        const result = await uploadSelfie(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), 'emp-1', 'clock_in');
        expect(result.url).toBeNull();
        expect(result.error).toBe('Employee not found or inactive');
        expect(result.nonJson).toBeUndefined();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('non-JSON 200 -> uploadSelfie returns nonJson sentinel; uploadSelfieWithRetry recovers on retry', async () => {
        vi.useFakeTimers();
        const first = htmlRes('<html>captive portal</html>', true, 200, 'text/html');
        const second = jsonRes({ success: true, publicUrl: '/x.jpg' }, true, 200);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(first as any)
            .mockResolvedValueOnce(second as any)
            .mockResolvedValueOnce(first as any)
            .mockResolvedValueOnce(second as any);
        vi.spyOn(globalThis, 'fetch' as any).mockImplementation(fetchMock as any);

        const { uploadSelfie, uploadSelfieWithRetry } = await import('../AttendanceKioskForm');

        // uploadSelfie alone
        const r1 = await uploadSelfie(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), 'emp-1', 'clock_in');
        expect(r1.url).toBeNull();
        expect(r1.nonJson).toBe(true);
        expect(r1.error).toContain('bukan JSON');

        // Reset module fetch mock for retry test - fresh counter
        vi.restoreAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetchMock2 = vi
            .fn()
            .mockResolvedValueOnce(first as any)
            .mockResolvedValueOnce(second as any);
        vi.spyOn(globalThis, 'fetch' as any).mockImplementation(fetchMock2 as any);

        const retryPromise = uploadSelfieWithRetry(
            new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
            'emp-1',
            'clock_in',
        );
        await vi.advanceTimersByTimeAsync(1000);
        const r2 = await retryPromise;
        expect(r2).toEqual({ url: '/x.jpg' });
        expect(fetchMock2).toHaveBeenCalledTimes(2);
    });

    it('non-JSON on both attempts -> returns error after exactly 2 fetch calls', async () => {
        vi.useFakeTimers();
        const nonJson = htmlRes('<html>captive</html>', true, 200, 'text/html');
        const fetchMock = vi.fn().mockResolvedValue(nonJson as any);
        vi.spyOn(globalThis, 'fetch' as any).mockImplementation(fetchMock as any);
        const { uploadSelfieWithRetry } = await import('../AttendanceKioskForm');

        const p = uploadSelfieWithRetry(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), 'emp-1', 'clock_in');
        await vi.advanceTimersByTimeAsync(1000);
        const result = await p;
        expect(result.url).toBeNull();
        expect(result.nonJson).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
