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

const mockRequireSalesAccess = vi.fn();
vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: (...args: unknown[]) =>
        mockRequireSalesAccess(...args),
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

import { POST } from '../route';

function makeFile(name = 'bukti.jpg', type = 'image/jpeg', size = 200_000) {
    const buf = new Uint8Array(size);
    return new File([buf], name, { type });
}

function fakeReq(fd: FormData) {
    return { formData: async () => fd } as any;
}

describe('/api/upload/remittance-proof', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireSalesAccess.mockResolvedValue({
            user: { id: 'u1', role: 'MARKETING' },
        });
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

    it('500 when caller is not SALES/MARKETING/ADMIN (guard rejects)', async () => {
        mockRequireSalesAccess.mockRejectedValue(
            new Error(
                'Unauthorized: Akses sales hanya untuk admin atau sales.',
            ),
        );
        const fd = new FormData();
        fd.append('file', makeFile());
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(500);
        const json = (await res.json()) as any;
        expect(json.error).toContain('Unauthorized');
    });

    it('200 success uploads and returns url/key', async () => {
        const fd = new FormData();
        fd.append('file', makeFile());
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
        const json = (await res.json()) as any;
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
