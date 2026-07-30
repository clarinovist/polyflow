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

const mockFindFirst = vi.fn();
const mockMainDb = {
    employee: { findFirst: mockFindFirst },
};

vi.mock('@/lib/core/prisma', () => ({
    prisma: { employee: { findFirst: vi.fn() } },
    getMainPrisma: vi.fn(() => mockMainDb),
}));

const mockTenantFindFirst = vi.fn();
const mockResolveTenantContext = vi.fn().mockResolvedValue({
    type: 'RESOLVED',
    tenantDb: { employee: { findFirst: mockTenantFindFirst } },
    tenantId: 'tenant-kiyowo',
    subdomain: 'kiyowo',
    activeModules: [],
});

vi.mock('@/lib/core/tenant', () => ({
    resolveTenantContext: (...args: unknown[]) => mockResolveTenantContext(...args),
}));

vi.mock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue('kiyowo.example.com') }),
}));

const mockUploadToR2 = vi.fn().mockResolvedValue('/api/images/kiyowo/attendance/emp-1/clock_in-123.jpg');
const mockBuildKey = vi.fn().mockReturnValue('kiyowo/attendance/emp-1/clock_in-123.jpg');
const mockGetTenantPrefix = vi.fn().mockResolvedValue('kiyowo');

vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: (...args: unknown[]) => mockGetTenantPrefix(...args),
    buildAttendancePhotoKey: (...args: unknown[]) => mockBuildKey(...args),
    uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
}));

import { POST } from '../route';

function makeFile(name = 'selfie.jpg', type = 'image/jpeg', size = 500_000) {
    const buf = new Uint8Array(size);
    return new File([buf], name, { type });
}

function fakeReq(fd: FormData) {
    return {
        headers: new Headers({ host: 'kiyowo.example.com' }),
        formData: async () => fd,
    } as any;
}

describe('/api/upload/attendance-photo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindFirst.mockResolvedValue({ id: 'emp-1' });
        mockTenantFindFirst.mockResolvedValue({ id: 'emp-1' });
        mockResolveTenantContext.mockResolvedValue({
            type: 'RESOLVED',
            tenantDb: { employee: { findFirst: mockTenantFindFirst } },
            tenantId: 'tenant-kiyowo',
            subdomain: 'kiyowo',
            activeModules: [],
        });
        mockUploadToR2.mockResolvedValue('/api/images/kiyowo/attendance/emp-1/clock_in-123.jpg');
        mockBuildKey.mockReturnValue('kiyowo/attendance/emp-1/clock_in-123.jpg');
        mockGetTenantPrefix.mockResolvedValue('kiyowo');
        // ensure find mocks resolve active
        mockTenantFindFirst.mockResolvedValue({ id: 'emp-1' });
        mockFindFirst.mockResolvedValue({ id: 'emp-1' });
    });

    it('400 missing file/employeeId', async () => {
        const fd = new FormData();
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('400 missing employeeId even with file', async () => {
        const fd = new FormData();
        fd.append('file', makeFile());
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('400 invalid employeeId format (contains space)', async () => {
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('employeeId', 'bad id');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect((json as any).error).toContain('Invalid employeeId');
    });

    it('400 invalid employeeId format (contains slash)', async () => {
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('employeeId', 'bad/id');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('404 employee not found', async () => {
        mockTenantFindFirst.mockResolvedValue(null);
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('employeeId', 'emp-999');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(404);
    });

    it('400 invalid mime type', async () => {
        const fd = new FormData();
        fd.append('file', makeFile('evil.gif', 'image/gif'));
        fd.append('employeeId', 'emp-1');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('200 success returns publicUrl', async () => {
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('employeeId', 'emp-1');
        fd.append('kind', 'clock_in');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
        const json = (await res.json()) as any;
        expect(json.success).toBe(true);
        expect(json.publicUrl).toContain('/api/images/');
        expect(mockUploadToR2).toHaveBeenCalled();
    });

    it('NOT_FOUND tenant fallback still returns 200 on matching employee in main DB', async () => {
        mockResolveTenantContext.mockResolvedValue({
            type: 'NOT_FOUND',
            subdomain: 'x',
        } as any);
        mockFindFirst.mockResolvedValue({ id: 'emp-1' });
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('employeeId', 'emp-1');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
        const json = (await res.json()) as any;
        expect(json.success).toBe(true);
    });
});
