import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    buildInvoice: vi.fn(),
    buildDelivery: vi.fn(),
    attachment: vi.fn(),
}));
// The global setup stubs both modules; this suite needs the real redirect error
// and real responses to prove the redirect is not swallowed.
vi.mock('next/navigation', async (importOriginal) => importOriginal());
vi.mock('next/server', () => ({
    NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));
vi.mock('@/lib/core/tenant', () => ({ withTenantRoute: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/modules/guard', () => ({
    requireModuleOrNextResponse: vi.fn().mockResolvedValue(null),
    requireAnyModuleOrNextResponse: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/printing/escp-invoice-document', () => ({ buildInvoiceDocument: mocks.buildInvoice }));
vi.mock('@/services/printing/escp-delivery-document', () => ({ buildDeliveryNoteDocument: mocks.buildDelivery }));
vi.mock('@/services/printing/escp-download', () => ({ escpAttachmentResponse: mocks.attachment }));

import { GET as invoiceGET } from '../invoice/route';
import { GET as deliveryGET } from '../delivery/route';
import { GET as bundleGET } from '../bundle/route';

type Handler = (req: NextRequest) => Promise<Response>;
const request = (query: string) =>
    ({ nextUrl: new URL(`https://tenant.test/api/print?${query}`) }) as unknown as NextRequest;
const routes: Array<{ name: string; GET: Handler; query: string; builder: () => ReturnType<typeof vi.fn> }> = [
    { name: 'invoice', GET: invoiceGET as Handler, query: 'id=inv-1', builder: () => mocks.buildInvoice },
    { name: 'delivery', GET: deliveryGET as Handler, query: 'id=do-1', builder: () => mocks.buildDelivery },
    { name: 'bundle', GET: bundleGET as Handler, query: 'doc=delivery:do-1&doc=invoice:inv-1', builder: () => mocks.buildDelivery },
];

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.requireAuth.mockResolvedValue(undefined);
    mocks.buildInvoice.mockResolvedValue({ bytes: [2], documentNumber: 'INV-TEST' });
    mocks.buildDelivery.mockResolvedValue({ bytes: [1], documentNumber: 'SJ-TEST' });
    mocks.attachment.mockReturnValue(new Response('escp'));
});

describe.each(routes)('/api/print/$name', ({ GET, query, builder }) => {
    it('lets the login redirect through instead of answering 500, and builds nothing', async () => {
        mocks.requireAuth.mockImplementation(async () => redirect('/login'));

        const error = await GET(request(query)).catch((e: unknown) => e);

        expect((error as { digest?: string }).digest).toMatch(/^NEXT_REDIRECT;replace;\/login;/);
        expect(builder()).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
    });

    it('still answers 500 and logs a real generation failure', async () => {
        builder().mockRejectedValueOnce(new Error('printer data broken'));

        const res = await GET(request(query));

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to generate ESC/P file' });
        expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('returns the ESC/P attachment for an authenticated request', async () => {
        const res = await GET(request(query));

        expect(await res.text()).toBe('escp');
        expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
    });

    it('answers 404 when a requested document does not exist', async () => {
        builder().mockResolvedValueOnce(null);

        expect((await GET(request(query))).status).toBe(404);
    });
});

describe.each(routes)('/api/print/$name input', ({ GET }) => {
    it('rejects a request without a document id', async () => {
        expect((await GET(request(''))).status).toBe(400);
    });
});

describe('/api/print/bundle', () => {
    it('joins the requested documents in order under the first document number', async () => {
        await bundleGET(request('doc=delivery:do-1&doc=invoice:inv-1'));

        expect(mocks.attachment).toHaveBeenCalledWith([1, 2], 'SJ-TEST-bundle');
    });
});
