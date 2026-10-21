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
        const res = await call(['globex', 'attendance', 'emp-1', 'clock_in-1.jpg']);
        expect(res.status).toBe(200);
    });

    it('does not let a signed-in tenant user read another tenant image', async () => {
        setHost('polyflow.uk');
        mockAuth.mockResolvedValue({ user: { id: 'u3', tenantSubdomain: 'acme' } });
        const res = await call(['globex', 'attendance', 'emp-1', 'clock_in-1.jpg']);
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
});
