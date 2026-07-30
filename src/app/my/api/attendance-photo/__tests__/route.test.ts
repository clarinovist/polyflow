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

vi.mock('@/lib/auth/employee-session', () => ({
    getEmployeeSession: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: { employee: { findUnique: vi.fn() } },
    getMainPrisma: vi.fn(() => ({
        employee: {
            findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' }),
            findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' }),
        },
    })),
}));

vi.mock('@/lib/core/tenant', () => ({
    resolveTenantContext: vi.fn().mockResolvedValue({
        type: 'RESOLVED',
        tenantDb: {
            employee: {
                findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' }),
                findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' }),
            },
        },
        tenantId: 'tenant-kiyowo',
        subdomain: 'kiyowo',
        activeModules: [],
    }),
}));

vi.mock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue({
        get: vi.fn().mockReturnValue('kiyowo.example.com'),
    }),
}));

vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: vi.fn().mockResolvedValue('kiyowo'),
    buildAttendancePhotoKey: vi.fn().mockReturnValue('kiyowo/attendance/emp-1/clock_in-123.jpg'),
    uploadToR2: vi.fn().mockResolvedValue('/api/images/kiyowo/attendance/emp-1/clock_in-123.jpg'),
}));

import { getEmployeeSession } from '@/lib/auth/employee-session';
import { prisma } from '@/lib/core/prisma';
import { uploadToR2, buildAttendancePhotoKey } from '@/lib/storage/r2';
import { POST } from '../route';

function makeFile(name = 'selfie.jpg', type = 'image/jpeg', size = 500_000) {
    const buf = new Uint8Array(size);
    return new File([buf], name, { type });
}

function fakeReq(fd: FormData) {
    return {
        formData: async () => fd,
    } as any;
}

describe('/my/api/attendance-photo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('401 when no session', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue(null);
        const fd = new FormData();
        fd.append('file', makeFile());
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(401);
    });

    it('401 when employee inactive', async () => {
        const { resolveTenantContext } = await import('@/lib/core/tenant');
        vi.mocked(resolveTenantContext as any).mockResolvedValueOnce({
            type: 'RESOLVED',
            tenantDb: {
                employee: {
                    findUnique: vi.fn().mockResolvedValue(null),
                    findFirst: vi.fn().mockResolvedValue(null),
                },
            },
            tenantId: 'tenant-kiyowo',
            subdomain: 'kiyowo',
            activeModules: [],
        });
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1', code: 'EMP-014', name: 'Rizal',
        } as any);
        vi.mocked(prisma.employee.findUnique).mockResolvedValue(null as any);
        const fd = new FormData();
        fd.append('file', makeFile());
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(401);
    });

    it('400 when file missing', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1', code: 'EMP-014', name: 'Rizal',
        } as any);
        vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' } as any);
        const fd = new FormData();
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('400 when invalid mime type', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1', code: 'EMP-014', name: 'Rizal',
        } as any);
        vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' } as any);
        const fd = new FormData();
        fd.append('file', makeFile('evil.gif', 'image/gif'));
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(400);
    });

    it('success with session and returns publicUrl', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1', code: 'EMP-014', name: 'Rizal',
        } as any);
        vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' } as any);
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('kind', 'clock_in');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.publicUrl).toContain('/api/images/');
        expect(uploadToR2).toHaveBeenCalled();
    });

    it('does not accept employeeId from client form (session-bound)', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1', code: 'EMP-014', name: 'Rizal',
        } as any);
        vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: 'emp-1', status: 'ACTIVE' } as any);
        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('employeeId', 'emp-hacker');
        fd.append('kind', 'clock_in');
        const res = await POST(fakeReq(fd));
        expect(res.status).toBe(200);
        expect(vi.mocked(buildAttendancePhotoKey).mock.calls[0][1]).toBe('emp-1');
    });
});
