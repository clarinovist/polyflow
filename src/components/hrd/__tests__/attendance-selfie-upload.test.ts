import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function jsonRes(body: unknown, ok = true, status = 200, ct = 'application/json') {
    return {
        ok,
        status,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? ct : null) },
        text: async () => JSON.stringify(body),
    };
}
function htmlRes(html: string, ok = true, status = 200, ct = 'text/html', opts?: { redirected?: boolean; url?: string }) {
    return {
        ok,
        status,
        redirected: opts?.redirected ?? false,
        url: opts?.url ?? 'http://localhost:3000/api/upload/attendance-photo',
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
        const { uploadSelfie } = await import('../attendance-selfie-upload');
        const result = await uploadSelfie(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), 'emp-1', 'clock_in');
        expect(result).toEqual({ url: '/x.jpg' });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('JSON error response (4xx) returns error message, no retry', async () => {
        fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
            jsonRes({ error: 'Employee not found or inactive' }, false, 404) as any,
        );
        const { uploadSelfie } = await import('../attendance-selfie-upload');
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

        const { uploadSelfie, uploadSelfieWithRetry } = await import('../attendance-selfie-upload');

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
        const { uploadSelfieWithRetry } = await import('../attendance-selfie-upload');

        const p = uploadSelfieWithRetry(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), 'emp-1', 'clock_in');
        await vi.advanceTimersByTimeAsync(1000);
        const result = await p;
        expect(result.url).toBeNull();
        expect(result.nonJson).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('redirected to /device/desktop-required -> reports mobile gate without retry', async () => {
        const redirectRes = htmlRes(
            '<html><body>Desktop Required</body></html>',
            true,
            200,
            'text/html',
            { redirected: true, url: 'https://kiyowo.polyflow.uk/device/desktop-required?from=%2Fapi%2Fupload%2Fattendance-photo' },
        );
        const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(redirectRes as any);
        const { uploadSelfieWithRetry } = await import('../attendance-selfie-upload');

        const result = await uploadSelfieWithRetry(
            new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
            'emp-1',
            'clock_in',
        );
        expect(result.url).toBeNull();
        expect(result.nonJson).toBe(true);
        expect(result.retryable).toBe(false);
        expect(result.error).toContain('Mobile gate');
        expect(result.error).not.toContain('captive portal');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('non-redirected non-JSON -> error mentions captive portal', async () => {
        const captiveRes = htmlRes(
            '<html><body>WiFi Login</body></html>',
            true,
            200,
            'text/html',
            { redirected: false, url: 'http://localhost:3000/api/upload/attendance-photo' },
        );
        vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(captiveRes as any);
        const { uploadSelfie } = await import('../attendance-selfie-upload');

        const result = await uploadSelfie(new File(['a'], 'a.jpg', { type: 'image/jpeg' }), 'emp-1', 'clock_in');
        expect(result.url).toBeNull();
        expect(result.nonJson).toBe(true);
        expect(result.error).toContain('captive portal');
        expect(result.error).not.toContain('Mobile gate');
    });
});
