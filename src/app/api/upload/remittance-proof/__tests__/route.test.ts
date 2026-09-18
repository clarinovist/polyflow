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

vi.mock('@/lib/modules/guard', () => ({
    requireModuleFromRequest: vi.fn().mockResolvedValue(null),
    requireAnyModuleFromRequest: vi.fn().mockResolvedValue(null),
}));

const mockUploadToR2 = vi
    .fn()
    .mockResolvedValue('/api/images/tenant/remittance-proof/u1/123.jpg');
const mockBuildKey = vi
    .fn()
    .mockReturnValue('tenant/remittance-proof/u1/123.jpg');
const mockGetTenantPrefix = vi.fn().mockResolvedValue('tenant');

vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: (...args: unknown[]) => mockGetTenantPrefix(...args),
    buildRemittanceProofKey: (...args: unknown[]) => mockBuildKey(...args),
    uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
}));

import { NextResponse, type NextRequest } from 'next/server';
import { POST } from '../route';

function makeFile(name = 'bukti.jpg', type = 'image/jpeg', size = 200_000) {
    const buf = new Uint8Array(size);
    return new File([buf], name, { type });
}

function fakeReq(fd: FormData) {
    return { formData: vi.fn(async () => fd) } as unknown as NextRequest;
}

describe('/api/upload/remittance-proof', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireApiAuth.mockResolvedValue({ response: null, userId: 'u1' });
        mockUploadToR2.mockResolvedValue(
            '/api/images/tenant/remittance-proof/u1/123.jpg',
        );
        mockBuildKey.mockReturnValue('tenant/remittance-proof/u1/123.jpg');
        mockGetTenantPrefix.mockResolvedValue('tenant');
    });

    it('400 when no file provided', async () => {
        const fd = new FormData();
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('400 for disallowed mime type', async () => {
        const fd = new FormData();
        fd.append('file', makeFile('evil.gif', 'image/gif'));
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('400 when file exceeds 10MB', async () => {
        const fd = new FormData();
        fd.append('file', makeFile('big.jpg', 'image/jpeg', 11 * 1024 * 1024));
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('403 when caller is not SALES/MARKETING/ADMIN, before reading the body', async () => {
        mockRequireApiAuth.mockResolvedValue({
            response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }),
            userId: '',
        });
        const request = fakeReq(new FormData());
        const res = await POST(request);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });
        expect(request.formData).not.toHaveBeenCalled();
        expect(mockUploadToR2).not.toHaveBeenCalled();
    });

    it('200 success uploads and returns url/key', async () => {
        const fd = new FormData();
        fd.append('file', makeFile());
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(mockRequireApiAuth).toHaveBeenCalledWith(expect.anything(), ['ADMIN', 'SALES', 'MARKETING']);
        expect(json.success).toBe(true);
        expect(json.url).toContain('/api/images/');
        expect(json.key).toBe('tenant/remittance-proof/u1/123.jpg');
        expect(mockBuildKey).toHaveBeenCalledWith(
            'tenant',
            'u1',
            'bukti.jpg',
        );
        expect(mockUploadToR2).toHaveBeenCalled();
    });

    it('infers image type from filename when MIME is empty (WA-shared screenshots)', async () => {
        const fd = new FormData();
        fd.append('file', makeFile('screenshot.jpg', '', 200_000));
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
    });
});
