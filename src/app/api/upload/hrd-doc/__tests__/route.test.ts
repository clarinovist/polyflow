import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
    redirect: vi.fn(),
    notFound: vi.fn(),
    unstable_rethrow: vi.fn(),
}));

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

vi.mock('@/lib/modules/guard', () => ({
    requireModuleFromRequest: vi.fn().mockResolvedValue(null),
    requireAnyModuleFromRequest: vi.fn().mockResolvedValue(null),
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

function sessionWithRole(role: string) {
    return { user: { id: 'user-1', role, roles: [role] } };
}

function fakeReq(fd: FormData) {
    return {
        formData: async () => fd,
    } as any;
}

describe('/api/upload/hrd-doc', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(sessionWithRole('HRD'));
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

    describe('role gate', () => {
        function validForm() {
            const fd = new FormData();
            fd.append('file', makeFile());
            fd.append('entityId', 'ent-1');
            return fd;
        }

        it.each(['SALES', 'EMPLOYEE', 'PRODUCTION'])(
            '403 — role %s is rejected without uploading',
            async (role) => {
                mockRequireAuth.mockResolvedValue(sessionWithRole(role));

                const res = await POST(fakeReq(validForm()));

                expect(res.status).toBe(403);
                expect(mockUploadToR2).not.toHaveBeenCalled();
            },
        );

        it.each(['HRD', 'FINANCE', 'ADMIN'])(
            '200 — role %s is accepted',
            async (role) => {
                mockRequireAuth.mockResolvedValue(sessionWithRole(role));

                const res = await POST(fakeReq(validForm()));

                expect(res.status).toBe(200);
                expect(mockUploadToR2).toHaveBeenCalledTimes(1);
            },
        );

        it('does not upload when there is no session', async () => {
            mockRequireAuth.mockRejectedValue(new Error('NEXT_REDIRECT'));

            await expect(POST(fakeReq(validForm()))).resolves.toMatchObject({
                status: 500,
            });
            expect(mockUploadToR2).not.toHaveBeenCalled();
        });
    });

    describe('entityId validation', () => {
        it.each(['../x', 'a/b', 'a b', '', 'x'.repeat(65), 'ent-1/../../x'])(
            '400 — entityId %j is rejected',
            async (entityId) => {
                const fd = new FormData();
                fd.append('file', makeFile());
                fd.append('entityId', entityId);

                const res = await POST(fakeReq(fd));

                expect(res.status).toBe(400);
                expect(mockUploadToR2).not.toHaveBeenCalled();
            },
        );

        it('200 — entityId with letters, digits, dash and underscore', async () => {
            const fd = new FormData();
            fd.append('file', makeFile());
            fd.append('entityId', 'ckx_123-AB');

            const res = await POST(fakeReq(fd));

            expect(res.status).toBe(200);
        });
    });

    describe('effective content type', () => {
        async function upload(name: string, type: string) {
            const fd = new FormData();
            fd.append('file', makeFile(name, type, 1000));
            fd.append('entityId', 'ent-1');
            return POST(fakeReq(fd));
        }

        it('400 — empty MIME with an .exe name', async () => {
            const res = await upload('payload.exe', '');
            expect(res.status).toBe(400);
            expect(mockUploadToR2).not.toHaveBeenCalled();
        });

        it('400 — empty MIME with no extension', async () => {
            const res = await upload('payload', '');
            expect(res.status).toBe(400);
        });

        it('400 — text/html MIME named .pdf', async () => {
            const res = await upload('evil.pdf', 'text/html');
            expect(res.status).toBe(400);
            expect(mockUploadToR2).not.toHaveBeenCalled();
        });

        it('stores the MIME type and a matching extension, not the raw name', async () => {
            const res = await upload('scan.pdf', 'image/png');

            expect(res.status).toBe(200);
            expect(mockUploadToR2.mock.calls[0][2]).toBe('image/png');
            expect(mockBuildHrdDocKey.mock.calls[0][3]).toMatch(/\.png$/);
        });

        it('guesses the type from the extension when MIME is empty', async () => {
            const res = await upload('Photo.JPG', '');

            expect(res.status).toBe(200);
            expect(mockUploadToR2.mock.calls[0][2]).toBe('image/jpeg');
            expect(mockBuildHrdDocKey.mock.calls[0][3]).toMatch(/\.jpg$/);
        });

        it('normalises image/jpg to image/jpeg', async () => {
            await upload('a.jpg', 'image/jpg');

            expect(mockUploadToR2.mock.calls[0][2]).toBe('image/jpeg');
        });

        it('stores application/pdf for pdf uploads', async () => {
            await upload('contract.pdf', 'application/pdf');

            expect(mockUploadToR2.mock.calls[0][2]).toBe('application/pdf');
            expect(mockBuildHrdDocKey.mock.calls[0][3]).toMatch(/\.pdf$/);
        });
    });
});
