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

const mockRequireAuth = vi.fn();
vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockUploadToR2 = vi.fn().mockResolvedValue('https://r2/polyflow/hrd/doc.pdf');
const mockBuildHrdDocKey = vi.fn().mockReturnValue('polyflow/hrd/disciplinary/ent-1/doc.pdf');
const mockGetTenantPrefix = vi.fn().mockResolvedValue('polyflow');

vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: (...args: unknown[]) => mockGetTenantPrefix(...args),
    buildHrdDocKey: (...args: unknown[]) => mockBuildHrdDocKey(...args),
    uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
}));

import { POST } from '../route';

function makeFile(name = 'doc.pdf', type = 'application/pdf', size = 200_000) {
    const buf = new Uint8Array(size);
    return new File([buf], name, { type });
}

function fakeReq(fd: FormData) {
    return {
        formData: async () => fd,
    } as any;
}

describe('/api/upload/hrd-doc', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue({ id: 'user-1' });
        mockUploadToR2.mockResolvedValue('https://r2/polyflow/hrd/doc.pdf');
        mockBuildHrdDocKey.mockReturnValue('polyflow/hrd/disciplinary/ent-1/doc.pdf');
        mockGetTenantPrefix.mockResolvedValue('polyflow');
    });

    it('200 success — valid file + entityId calls uploadToR2', async () => {
        const fd = new FormData();
        fd.append('file', makeFile('doc.pdf', 'application/pdf'));
        fd.append('entityId', 'ent-1');

        const res = await POST(fakeReq(fd));

        expect(res.status).toBe(200);
        const json = (await res.json()) as any;
        expect(json.success).toBe(true);
        expect(json.publicUrl).toBeDefined();
        expect(mockUploadToR2).toHaveBeenCalled();
    });

    it('auth rejected — uploadToR2 not called', async () => {
        mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));

        const fd = new FormData();
        fd.append('file', makeFile());
        fd.append('entityId', 'ent-1');

        await POST(fakeReq(fd));

        expect(mockUploadToR2).not.toHaveBeenCalled();
    });

    it('400 — missing file', async () => {
        const fd = new FormData();
        fd.append('entityId', 'ent-1');

        const res = await POST(fakeReq(fd));

        expect(res.status).toBe(400);
    });

    it('400 — missing entityId', async () => {
        const fd = new FormData();
        fd.append('file', makeFile());

        const res = await POST(fakeReq(fd));

        expect(res.status).toBe(400);
    });

    it('400 — MIME not allowed and filename fallback also not allowed', async () => {
        const fd = new FormData();
        // gif MIME not in ALLOWED_TYPES, and .gif filename not guessed as allowed
        fd.append('file', makeFile('evil.gif', 'image/gif'));
        fd.append('entityId', 'ent-1');

        const res = await POST(fakeReq(fd));

        expect(res.status).toBe(400);
    });

    it('200 — empty MIME with pdf filename passes via guess', async () => {
        const fd = new FormData();
        fd.append('file', makeFile('contract.pdf', '', 100_000));
        fd.append('entityId', 'ent-1');

        const res = await POST(fakeReq(fd));

        // guessImageTypeFromName handles .pdf → application/pdf which is allowed
        expect(res.status).toBe(200);
    });

    it('400 — file size exceeds 2MB', async () => {
        const fd = new FormData();
        fd.append('file', makeFile('big.pdf', 'application/pdf', 3 * 1024 * 1024));
        fd.append('entityId', 'ent-1');

        const res = await POST(fakeReq(fd));

        expect(res.status).toBe(400);
    });
});
