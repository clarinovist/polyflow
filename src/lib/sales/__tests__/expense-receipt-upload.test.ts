import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const compress = vi.hoisted(() => vi.fn());
vi.mock('@/lib/media/compress-image', () => ({
    compressImageForUpload: compress,
}));

import {
    EXPENSE_RECEIPT_UPLOAD_ENDPOINT,
    ReceiptUploadError,
    uploadExpenseReceipt,
} from '../expense-receipt-upload';

const original = new File(['raw'], 'nota.heic', { type: 'image/heic' });
const compressed = new File(['small'], 'upload.jpg', { type: 'image/jpeg' });

function respond(status: number, body: unknown): Response {
    return new Response(
        typeof body === 'string' ? body : JSON.stringify(body),
        { status },
    );
}

describe('uploadExpenseReceipt', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        compress.mockResolvedValue(compressed);
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('uploads the compressed file in the "file" field and returns the url', async () => {
        fetchMock.mockResolvedValue(
            respond(200, { success: true, url: '/api/images/k/1.jpg' }),
        );

        const url = await uploadExpenseReceipt(original);

        expect(url).toBe('/api/images/k/1.jpg');
        const [endpoint, init] = fetchMock.mock.calls[0];
        expect(endpoint).toBe(EXPENSE_RECEIPT_UPLOAD_ENDPOINT);
        expect(init.method).toBe('POST');
        expect((init.body as FormData).get('file')).toBe(compressed);
    });

    it('asks the user to log in again on 401', async () => {
        fetchMock.mockResolvedValue(respond(401, { error: 'x' }));
        await expect(uploadExpenseReceipt(original)).rejects.toThrow(
            'Sesi berakhir, silakan login kembali.',
        );
    });

    it('surfaces the server error message', async () => {
        fetchMock.mockResolvedValue(
            respond(400, { error: 'File terlalu besar. Maksimal 10MB.' }),
        );
        await expect(uploadExpenseReceipt(original)).rejects.toThrow(
            'File terlalu besar. Maksimal 10MB.',
        );
    });

    it('falls back to a generic message when the response has no url or error', async () => {
        fetchMock.mockResolvedValue(respond(200, { success: true }));
        await expect(uploadExpenseReceipt(original)).rejects.toThrow(
            'Upload nota gagal.',
        );
    });

    it('reports the HTTP status when the body is not JSON', async () => {
        fetchMock.mockResolvedValue(respond(502, '<html>bad gateway</html>'));
        await expect(uploadExpenseReceipt(original)).rejects.toThrow(
            'Upload gagal (HTTP 502).',
        );
    });

    it('reports a connection problem when fetch itself fails', async () => {
        fetchMock.mockRejectedValue(new TypeError('network down'));
        const failure = uploadExpenseReceipt(original);
        await expect(failure).rejects.toBeInstanceOf(ReceiptUploadError);
        await expect(failure).rejects.toThrow('Cek koneksi');
    });
});
