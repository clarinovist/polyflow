import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
    class MockNextResponse {
        status: number;
        _body: unknown;
        constructor(body?: unknown, init?: { status?: number }) {
            this._body = body;
            this.status = init?.status ?? 200;
        }
        async json() {
            return this._body;
        }
        static json(body: unknown, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }
    return { NextResponse: MockNextResponse };
});

const mockRequireApiAuth = vi.fn();
vi.mock('@/lib/tools/api-auth', () => ({
    requireApiAuth: (...args: unknown[]) => mockRequireApiAuth(...args),
}));

const mockRequireModule = vi.fn();
vi.mock('@/lib/modules/guard', () => ({
    requireModuleFromRequest: (...args: unknown[]) => mockRequireModule(...args),
}));

const mockUploadToR2 = vi.fn();
const mockBuildKey = vi.fn();
const mockGetTenantPrefix = vi.fn();
vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: (...args: unknown[]) => mockGetTenantPrefix(...args),
    buildExpenseReceiptKey: (...args: unknown[]) => mockBuildKey(...args),
    uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
}));

import { NextResponse, type NextRequest } from 'next/server';
import { POST } from '../route';

function makeFile(name = 'nota.jpg', type = 'image/jpeg', size = 200_000) {
    return new File([new Uint8Array(size)], name, { type });
}

function fakeReq(fd: FormData) {
    return { formData: vi.fn(async () => fd) } as unknown as NextRequest;
}

function formWith(file?: File) {
    const fd = new FormData();
    if (file) fd.append('file', file);
    return fd;
}

describe('/api/upload/expense-receipt', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireApiAuth.mockResolvedValue({ response: null, userId: 'u1' });
        mockRequireModule.mockResolvedValue(null);
        mockGetTenantPrefix.mockResolvedValue('tenant');
        mockBuildKey.mockReturnValue('tenant/expense-receipt/u1/123.jpg');
        mockUploadToR2.mockResolvedValue('/api/images/tenant/expense-receipt/u1/123.jpg');
    });

    it('returns 400 when no file is provided', async () => {
        const res = await POST(fakeReq(formWith()));
        expect(res.status).toBe(400);
        expect(mockUploadToR2).not.toHaveBeenCalled();
    });

    it('returns 400 for a disallowed MIME type', async () => {
        const res = await POST(fakeReq(formWith(makeFile('nota.gif', 'image/gif'))));
        expect(res.status).toBe(400);
        expect(mockUploadToR2).not.toHaveBeenCalled();
    });

    it('returns 400 for a non-image file named like an image', async () => {
        const res = await POST(fakeReq(formWith(makeFile('nota.jpg', 'application/pdf'))));
        expect(res.status).toBe(400);
    });

    it('returns 400 when the file exceeds 10MB', async () => {
        const res = await POST(fakeReq(formWith(makeFile('big.jpg', 'image/jpeg', 11 * 1024 * 1024))));
        expect(res.status).toBe(400);
        expect(mockUploadToR2).not.toHaveBeenCalled();
    });

    it('returns the auth response before reading the body', async () => {
        mockRequireApiAuth.mockResolvedValue({
            response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }),
            userId: '',
        });
        const request = fakeReq(formWith(makeFile()));
        const res = await POST(request);
        expect(res.status).toBe(403);
        expect(request.formData).not.toHaveBeenCalled();
    });

    it('returns the module guard response when FINANCE is not entitled', async () => {
        mockRequireModule.mockResolvedValue(
            NextResponse.json({ error: 'Module not available' }, { status: 403 }),
        );
        const request = fakeReq(formWith(makeFile()));
        const res = await POST(request);
        expect(res.status).toBe(403);
        expect(request.formData).not.toHaveBeenCalled();
    });

    it('uploads, derives the extension from the MIME and returns url and key', async () => {
        const res = await POST(fakeReq(formWith(makeFile('nota.exe', 'image/png'))));
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(mockRequireApiAuth).toHaveBeenCalledWith(expect.anything(), ['ADMIN', 'SALES', 'MARKETING']);
        expect(mockRequireModule).toHaveBeenCalledWith(expect.anything(), 'FINANCE');
        expect(mockBuildKey).toHaveBeenCalledWith('tenant', 'u1', 'png');
        expect(mockUploadToR2).toHaveBeenCalledWith(
            'tenant/expense-receipt/u1/123.jpg',
            expect.any(Buffer),
            'image/png',
        );
        expect(json).toMatchObject({
            success: true,
            url: '/api/images/tenant/expense-receipt/u1/123.jpg',
            key: 'tenant/expense-receipt/u1/123.jpg',
            mimeType: 'image/png',
        });
    });

    it('infers the image type from the filename when the MIME is empty', async () => {
        const res = await POST(fakeReq(formWith(makeFile('screenshot.jpeg', ''))));
        expect(res.status).toBe(200);
        expect(mockBuildKey).toHaveBeenCalledWith('tenant', 'u1', 'jpg');
        expect(mockUploadToR2).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), 'image/jpeg');
    });

    it('returns 500 with a message when the storage upload fails', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockUploadToR2.mockRejectedValue(new Error('R2 down'));
        const res = await POST(fakeReq(formWith(makeFile())));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toContain('R2 down');
        spy.mockRestore();
    });

    it('returns 500 with a generic message for a non-Error throw', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockUploadToR2.mockRejectedValue('boom');
        const res = await POST(fakeReq(formWith(makeFile())));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toContain('Upload failed');
        spy.mockRestore();
    });
});
