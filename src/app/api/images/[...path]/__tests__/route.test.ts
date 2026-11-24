import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
    class MockNextResponse {
        body: unknown;
        status: number;
        headers: Record<string, string> | undefined;
        constructor(
            body?: unknown,
            init?: { status?: number; headers?: Record<string, string> },
        ) {
            this.body = body;
            this.status = init?.status ?? 200;
            this.headers = init?.headers;
        }
    }
    return { NextResponse: MockNextResponse };
});

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

const mockHeaderMap = vi.fn();
vi.mock('next/headers', () => ({
    headers: () =>
        Promise.resolve({ get: (name: string) => mockHeaderMap()[name] ?? null }),
}));

const mockSend = vi.fn();
vi.mock('@/lib/storage/r2', () => ({
    BUCKET: 'polyflow-uploads',
    r2Client: { send: (...args: unknown[]) => mockSend(...args) },
}));

import { GET } from '../route';

type MockResponse = { status: number; headers?: Record<string, string> };

function call(path: string[]): Promise<MockResponse> {
    return GET({} as never, {
        params: Promise.resolve({ path }),
    }) as unknown as Promise<MockResponse>;
}

function setHost(host: string) {
    mockHeaderMap.mockReturnValue({ host });
}

beforeEach(() => {
    vi.clearAllMocks();
    setHost('acme.polyflow.uk');
    mockAuth.mockResolvedValue(null);
    mockSend.mockResolvedValue({
        Body: { transformToWebStream: () => 'stream' },
        ContentType: 'image/jpeg',
    });
});

describe('GET /api/images/[...path]', () => {
    const photoKey = ['acme', 'production', 'exec-1', '1785250166883.jpg'];

    it('serves an image of the tenant that owns the host, without a session (kiosk)', async () => {
        const res = await call(photoKey);
        expect(res.status).toBe(200);
        expect(res.headers?.['Content-Type']).toBe('image/jpeg');
        expect(res.headers?.['Cache-Control']).toBe('private, max-age=86400');
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect((mockSend.mock.calls[0][0] as { input: { Key: string } }).input.Key).toBe(
            photoKey.join('/'),
        );
    });

    it('blocks database dumps under a backups path', async () => {
        const res = await call(['acme', 'backups', 'acme', '20261021_020001.sql.gz']);
        expect(res.status).toBe(404);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it.each([
        ['backup segment', ['acme', 'backup', 'acme', 'x.sql.gz']],
        ['archive segment', ['archive', 'retired-tenants', 'x', 'dump.sql.gz']],
        ['uppercase segment', ['acme', 'BACKUPS', 'acme', 'x.sql.gz']],
        ['hrd document pdf', ['acme', 'hrd-docs', 'loan', 'doc-1', '1787886860020.pdf']],
        ['unknown extension', ['acme', 'production', 'exec-1', 'anomaly.hostname']],
        ['no extension', ['acme', 'production', 'exec-1', 'rawfile']],
        ['traversal segment', ['acme', '..', 'globex', 'production', 'exec-1', 'a.jpg']],
        ['single segment', ['photo.jpg']],
    ])('rejects %s', async (_label, path) => {
        const res = await call(path as string[]);
        expect(res.status).toBe(404);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('rejects a cross-tenant read from an anonymous caller', async () => {
        const res = await call(['globex', 'production', 'exec-1', 'a.jpg']);
        expect(res.status).toBe(404);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('rejects a cross-tenant read on a reserved host without a session', async () => {
        setHost('admin.polyflow.uk');
        const res = await call(['globex', 'production', 'exec-1', 'a.jpg']);
        expect(res.status).toBe(404);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('lets a super admin read another tenant image', async () => {
        setHost('admin.polyflow.uk');
        mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: true } });
        const res = await call(['globex', 'production', 'exec-1', 'a.jpg']);
        expect(res.status).toBe(200);
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('lets a signed-in user read their own tenant image from the apex host', async () => {
        setHost('polyflow.uk');
        mockAuth.mockResolvedValue({ user: { id: 'u2', tenantSubdomain: 'globex' } });
        const res = await call(['globex', 'production', 'exec-1', 'a.jpg']);
        expect(res.status).toBe(200);
    });

    it('does not let a signed-in tenant user read another tenant image', async () => {
        setHost('polyflow.uk');
        mockAuth.mockResolvedValue({ user: { id: 'u3', tenantSubdomain: 'acme' } });
        const res = await call(['globex', 'production', 'exec-1', 'a.jpg']);
        expect(res.status).toBe(404);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 when the path is empty', async () => {
        const res = await call([]);
        expect(res.status).toBe(400);
    });

    it('returns 404 when the object has no body', async () => {
        mockSend.mockResolvedValueOnce({});
        const res = await call(photoKey);
        expect(res.status).toBe(404);
    });

    it('returns 404 when storage lookup fails', async () => {
        mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));
        const res = await call(photoKey);
        expect(res.status).toBe(404);
    });

    describe('HRD documents', () => {
        const hrdKey = ['acme', 'hrd-docs', 'loan', 'doc-1', '1787886860020.jpg'];
        const userOf = (role: string, tenantSubdomain = 'acme') => ({
            user: { id: 'u9', role, roles: [role], tenantSubdomain },
        });

        it('hides hrd-docs from an anonymous caller on the tenant host', async () => {
            const res = await call(hrdKey);
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it.each(['HRD', 'FINANCE', 'ADMIN'])(
            'serves hrd-docs to a %s user of the same tenant',
            async (role) => {
                mockAuth.mockResolvedValue(userOf(role));
                const res = await call(hrdKey);
                expect(res.status).toBe(200);
                expect(mockSend).toHaveBeenCalledTimes(1);
            },
        );

        it.each(['SALES', 'EMPLOYEE', 'PRODUCTION'])(
            'hides hrd-docs from a %s user of the same tenant',
            async (role) => {
                mockAuth.mockResolvedValue(userOf(role));
                const res = await call(hrdKey);
                expect(res.status).toBe(404);
                expect(mockSend).not.toHaveBeenCalled();
            },
        );

        it('hides hrd-docs from an HRD user of another tenant', async () => {
            mockAuth.mockResolvedValue(userOf('HRD', 'globex'));
            const res = await call(hrdKey);
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it('matches the hrd-docs segment case-insensitively', async () => {
            const res = await call(['acme', 'HRD-Docs', 'loan', 'd', '1.jpg']);
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it('lets a super admin read hrd-docs of any tenant', async () => {
            setHost('admin.polyflow.uk');
            mockAuth.mockResolvedValue({
                user: { id: 'u1', isSuperAdmin: true },
            });
            const res = await call(['globex', ...hrdKey.slice(1)]);
            expect(res.status).toBe(200);
        });

        it('does not treat hrd-docs deeper in the path as a gated prefix', async () => {
            const res = await call(['acme', 'production', 'hrd-docs', '1.jpg']);
            expect(res.status).toBe(200);
        });
    });

    describe('HRD documents per category', () => {
        const userOf = (role: string, tenantSubdomain = 'acme') => ({
            user: { id: 'u9', role, roles: [role], tenantSubdomain },
        });
        const docKey = (category: string) => [
            'acme', 'hrd-docs', category, 'doc-1', '1787886860020.jpg',
        ];

        it.each(['disciplinary', 'leave', 'employee'])(
            'serves %s documents to HRD',
            async (category) => {
                mockAuth.mockResolvedValue(userOf('HRD'));
                const res = await call(docKey(category));
                expect(res.status).toBe(200);
            },
        );

        it.each(['disciplinary', 'leave', 'employee', 'unknown-category'])(
            'hides %s documents from FINANCE',
            async (category) => {
                mockAuth.mockResolvedValue(userOf('FINANCE'));
                const res = await call(docKey(category));
                expect(res.status).toBe(404);
                expect(mockSend).not.toHaveBeenCalled();
            },
        );

        it('hides disciplinary documents from an anonymous caller on the tenant host', async () => {
            const res = await call(docKey('disciplinary'));
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it('serves loan documents to FINANCE', async () => {
            mockAuth.mockResolvedValue(userOf('FINANCE'));
            const res = await call(docKey('loan'));
            expect(res.status).toBe(200);
        });

        it('serves an unknown category to HRD (approver roles by default)', async () => {
            mockAuth.mockResolvedValue(userOf('HRD'));
            const res = await call(docKey('unknown-category'));
            expect(res.status).toBe(200);
        });

        it('matches the category case-insensitively', async () => {
            mockAuth.mockResolvedValue(userOf('FINANCE'));
            const res = await call(docKey('DISCIPLINARY'));
            expect(res.status).toBe(404);
        });

        it('lets a super admin read any category', async () => {
            setHost('admin.polyflow.uk');
            mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: true } });
            const res = await call(docKey('disciplinary'));
            expect(res.status).toBe(200);
        });
    });

    describe('attendance selfies', () => {
        const selfieKey = ['acme', 'attendance', 'emp-1', 'clock_in-1.jpg'];
        const userOf = (role: string, tenantSubdomain = 'acme') => ({
            user: { id: 'u9', role, roles: [role], tenantSubdomain },
        });

        it('hides selfies from an anonymous caller on the matching tenant host', async () => {
            const res = await call(selfieKey);
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it.each(['HRD', 'FINANCE', 'ADMIN'])(
            'serves selfies to a %s user of the same tenant',
            async (role) => {
                mockAuth.mockResolvedValue(userOf(role));
                const res = await call(selfieKey);
                expect(res.status).toBe(200);
            },
        );

        it.each(['SALES', 'EMPLOYEE', 'PRODUCTION'])(
            'hides selfies from a %s user of the same tenant',
            async (role) => {
                mockAuth.mockResolvedValue(userOf(role));
                const res = await call(selfieKey);
                expect(res.status).toBe(404);
                expect(mockSend).not.toHaveBeenCalled();
            },
        );

        it('hides selfies from an HRD user of another tenant', async () => {
            mockAuth.mockResolvedValue(userOf('HRD', 'globex'));
            const res = await call(selfieKey);
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it('lets a super admin read selfies of any tenant', async () => {
            setHost('admin.polyflow.uk');
            mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: true } });
            const res = await call(['globex', ...selfieKey.slice(1)]);
            expect(res.status).toBe(200);
        });

        it('matches the attendance segment case-insensitively', async () => {
            const res = await call(['acme', 'Attendance', 'emp-1', 'a.jpg']);
            expect(res.status).toBe(404);
        });

        it('keeps other prefixes anonymous-per-subdomain (delivery, warehouse)', async () => {
            for (const prefix of ['production', 'delivery', 'warehouse', 'customers']) {
                const res = await call(['acme', prefix, 'x', 'a.jpg']);
                expect(res.status).toBe(200);
            }
        });
    });

    describe('response headers', () => {
        it('sets nosniff', async () => {
            const res = await call(photoKey);
            expect(res.headers?.['X-Content-Type-Options']).toBe('nosniff');
        });

        it.each([
            ['a.jpg', 'image/jpeg'],
            ['a.JPEG', 'image/jpeg'],
            ['a.png', 'image/png'],
            ['a.webp', 'image/webp'],
        ])('derives Content-Type from the key extension (%s)', async (file, expected) => {
            mockSend.mockResolvedValue({
                Body: { transformToWebStream: () => 'stream' },
                ContentType: 'text/html',
            });
            const res = await call(['acme', 'production', 'exec-1', file]);
            expect(res.headers?.['Content-Type']).toBe(expected);
        });
    });

    describe('expense receipts', () => {
        const ownerId = 'sales-owner';
        const receiptKey = ['acme', 'expense-receipt', ownerId, '1787886860020.jpg'];
        const userOf = (role: string, id = 'u9', tenantSubdomain = 'acme') => ({
            user: { id, role, roles: [role], tenantSubdomain },
        });

        it('hides a receipt from an anonymous caller even when the host matches', async () => {
            const res = await call(receiptKey);
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it('serves a receipt to the SALES user who owns the folder', async () => {
            mockAuth.mockResolvedValue(userOf('SALES', ownerId));
            const res = await call(receiptKey);
            expect(res.status).toBe(200);
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it("hides a receipt from another SALES user of the same tenant", async () => {
            mockAuth.mockResolvedValue(userOf('SALES', 'sales-other'));
            const res = await call(receiptKey);
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it.each(['ADMIN', 'MARKETING', 'FINANCE'])(
            'serves any receipt to a %s user of the same tenant',
            async (role) => {
                mockAuth.mockResolvedValue(userOf(role));
                const res = await call(receiptKey);
                expect(res.status).toBe(200);
            },
        );

        it.each(['WAREHOUSE', 'HRD', 'PRODUCTION'])(
            'hides a receipt from a %s user even with a matching folder id',
            async (role) => {
                mockAuth.mockResolvedValue(userOf(role, ownerId));
                const res = await call(receiptKey);
                expect(res.status).toBe(404);
                expect(mockSend).not.toHaveBeenCalled();
            },
        );

        it('hides a receipt from a finance user of another tenant', async () => {
            mockAuth.mockResolvedValue(userOf('FINANCE', 'u9', 'globex'));
            const res = await call(receiptKey);
            expect(res.status).toBe(404);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it('hides a receipt from the owner id of another tenant', async () => {
            mockAuth.mockResolvedValue(userOf('SALES', ownerId, 'globex'));
            const res = await call(receiptKey);
            expect(res.status).toBe(404);
        });

        it('lets a super admin read a receipt of any tenant', async () => {
            setHost('admin.polyflow.uk');
            mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: true } });
            const res = await call(['globex', ...receiptKey.slice(1)]);
            expect(res.status).toBe(200);
        });

        it('matches the segment case-insensitively and needs a user folder and file', async () => {
            mockAuth.mockResolvedValue(userOf('SALES', ownerId));
            expect((await call(['acme', 'Expense-Receipt', 'sales-other', '1.jpg'])).status).toBe(404);
            expect((await call(['acme', 'expense-receipt', ownerId + '.jpg'])).status).toBe(404);
        });

        it('does not gate expense-receipt deeper in the path', async () => {
            const res = await call(['acme', 'production', 'expense-receipt', '1.jpg']);
            expect(res.status).toBe(200);
        });
    });
});
