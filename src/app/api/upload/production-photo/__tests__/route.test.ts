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

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
    auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockProductionExecutionFindUnique = vi.fn();
vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: vi.fn(() => ({
        productionExecution: {
            findUnique: mockProductionExecutionFindUnique,
        },
    })),
}));

const mockResolveTenantContext = vi.fn();
vi.mock('@/lib/core/tenant', () => ({
    resolveTenantContext: (...args: unknown[]) => mockResolveTenantContext(...args),
}));

vi.mock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue({
        get: vi.fn().mockReturnValue('kiyowo.example.com'),
    }),
}));

vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: vi.fn().mockResolvedValue('kiyowo'),
    buildProductionPhotoKey: vi.fn().mockReturnValue('kiyowo/production/exec-1/123.jpg'),
    uploadToR2: vi.fn().mockResolvedValue('/api/images/kiyowo/production/exec-1/123.jpg'),
}));

import { POST } from '../route';
import { uploadToR2 } from '@/lib/storage/r2';

function makeFile(name = 'photo.jpg', type = 'image/jpeg', size = 500_000) {
    const buf = new Uint8Array(size);
    return new File([buf], name, { type });
}

function fakeReq(fd: FormData, headersMap?: Map<string, string>) {
    const hdrs = headersMap ?? new Map<string, string>([['host', 'kiyowo.example.com']]);
    return {
        headers: {
            get: (k: string) => hdrs.get(k) ?? null,
        },
        formData: async () => fd,
    } as any;
}

describe('/api/upload/production-photo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveTenantContext.mockResolvedValue({
            type: 'RESOLVED',
            tenantDb: {
                productionExecution: {
                    findUnique: mockProductionExecutionFindUnique,
                },
            },
            tenantId: 'tenant-kiyowo',
            subdomain: 'kiyowo',
            activeModules: [],
        });
    });

    it('logged-in user + valid file → 200, uploadToR2 called', async () => {
        mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('executionId', 'exec-1');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.publicUrl).toContain('/api/images/');
        expect(uploadToR2).toHaveBeenCalled();
    });

    it('anonymous kiosk + executionId exists → 200', async () => {
        mockAuth.mockResolvedValue(null);
        mockProductionExecutionFindUnique.mockResolvedValue({ id: 'exec-1' });
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('executionId', 'exec-1');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(uploadToR2).toHaveBeenCalled();
    });

    it('anonymous + executionId not found → 403, uploadToR2 not called', async () => {
        mockAuth.mockResolvedValue(null);
        mockProductionExecutionFindUnique.mockResolvedValue(null);
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('executionId', 'exec-fake');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(403);
        expect(uploadToR2).not.toHaveBeenCalled();
        const json = await res.json();
        expect(json.error).toMatch(/tidak ditemukan/i);
    });

    it('400 when file missing', async () => {
        mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
        const fd = new FormData();
        fd.append('executionId', 'exec-1');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('400 when file > 15MB', async () => {
        mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
        const fd = new FormData();
        fd.append('file', makeFile('big.jpg', 'image/jpeg', 16 * 1024 * 1024));
        fd.append('executionId', 'exec-1');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain('15MB');
    });

    it('400 when MIME not allowed (application/pdf)', async () => {
        mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
        const fd = new FormData();
        fd.append('file', makeFile('doc.pdf', 'application/pdf', 100_000));
        fd.append('executionId', 'exec-1');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
        expect(uploadToR2).not.toHaveBeenCalled();
    });
});
