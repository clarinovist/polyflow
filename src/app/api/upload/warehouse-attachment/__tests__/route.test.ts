import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('next/server', () => ({ NextResponse: Response }));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), module: vi.fn(), upload: vi.fn(), key: vi.fn() }));
vi.mock('@/lib/tools/api-auth', () => ({ requireApiAuth: mocks.auth }));
vi.mock('@/lib/modules/guard', () => ({ requireModuleFromRequest: mocks.module }));
vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: async () => 'fixture',
    buildWarehouseAttachmentKey: mocks.key,
    uploadToR2: mocks.upload,
}));
import { POST } from '../route';

function form() {
    const fd = new FormData();
    fd.set('file', new File(['x'], 'proof.jpg', { type: 'image/jpeg' }));
    fd.set('deliveryOrderId', 'do-1');
    fd.set('checkpoint', 'LOAD');
    return fd;
}

async function post(fd: FormData) {
    return POST({ formData: async () => fd } as unknown as NextRequest);
}

describe('warehouse attachment validation regression', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ response: null, userId: 'u1' });
        mocks.module.mockResolvedValue(null);
        mocks.key.mockReturnValue('fixture/proof.jpg');
        mocks.upload.mockResolvedValue('/api/images/fixture/proof.jpg');
    });

    it.each([
        ['missing file', (fd: FormData) => fd.delete('file')],
        ['missing reference', (fd: FormData) => fd.delete('deliveryOrderId')],
        ['multiple references', (fd: FormData) => fd.set('goodsReceiptId', 'gr-1')],
        ['missing checkpoint', (fd: FormData) => fd.delete('checkpoint')],
        ['invalid checkpoint', (fd: FormData) => fd.set('checkpoint', 'INVALID')],
        ['invalid document type', (fd: FormData) => fd.set('documentType', 'INVALID')],
        ['invalid image', (fd: FormData) => fd.set('file', new File(['x'], 'proof.gif', { type: 'image/gif' }))],
        ['unknown empty MIME', (fd: FormData) => fd.set('file', new File(['x'], 'proof.unknown'))],
        ['oversize file', (fd: FormData) => fd.set('file', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'proof.jpg', { type: 'image/jpeg' }))],
        ['invalid document', (fd: FormData) => { fd.set('documentType', 'OTHER'); fd.set('file', new File(['x'], 'proof.txt', { type: 'text/plain' })); }],
    ] as const)('400 for %s without R2 upload', async (_name, mutate) => {
        const fd = form();
        mutate(fd);
        expect((await post(fd)).status).toBe(400);
        expect(mocks.upload).not.toHaveBeenCalled();
    });

    it.each(['jpg', 'png', 'webp', 'heic', 'heif'])('accepts empty MIME inferred from %s', async (ext) => {
        const fd = form();
        fd.set('file', new File(['x'], `proof.${ext}`));
        expect((await post(fd)).status).toBe(200);
    });

    it.each(['application/pdf', ''])('accepts PDF documents (%s)', async (type) => {
        const fd = form();
        fd.set('documentType', 'SURAT_JALAN');
        fd.set('file', new File(['x'], 'proof.pdf', { type }));
        expect((await post(fd)).status).toBe(200);
    });

    it.each([
        ['deliveryOrderId', 'do'], ['goodsReceiptId', 'gr'], ['purchaseOrderId', 'po'],
        ['stockOpnameId', 'opname'], ['stockOpnameItemId', 'opname'],
    ])('preserves key mapping for %s', async (field, type) => {
        const fd = form();
        fd.delete('deliveryOrderId');
        fd.set(field, 'entity-1');
        expect((await post(fd)).status).toBe(200);
        expect(mocks.key).toHaveBeenCalledWith('fixture', type, 'entity-1', 'LOAD', 'proof.jpg');
    });

    it('accepts stockOpname + stockOpnameItem pair', async () => {
        const fd = form();
        fd.delete('deliveryOrderId');
        fd.set('stockOpnameId', 'opname-1');
        fd.set('stockOpnameItemId', 'item-1');
        fd.set('checkpoint', 'OPNAME');
        expect((await post(fd)).status).toBe(200);
        expect(mocks.key).toHaveBeenCalledWith('fixture', 'opname', 'opname-1', 'OPNAME', 'proof.jpg');
    });
});
