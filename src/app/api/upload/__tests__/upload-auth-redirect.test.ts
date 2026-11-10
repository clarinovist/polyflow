import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('next/server', () => ({ NextResponse: Response }));
// Setup global hanya mengekspor redirect/notFound; pakai unstable_rethrow asli.
vi.mock('next/navigation', async (importOriginal) => ({
    ...(await importOriginal<typeof import('next/navigation')>()),
}));

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    requireModuleFromRequest: vi.fn(),
    uploadToR2: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/modules/guard', () => ({
    requireModuleFromRequest: mocks.requireModuleFromRequest,
}));
vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: vi.fn().mockResolvedValue('tenant'),
    buildCustomerPhotoKey: vi.fn().mockReturnValue('tenant/customers/key'),
    buildHrdDocKey: vi.fn().mockReturnValue('tenant/hrd/key'),
    buildDeliveryPhotoKey: vi.fn().mockReturnValue('tenant/delivery/key'),
    uploadToR2: mocks.uploadToR2,
}));

import { POST as uploadPost } from '../route';
import { POST as hrdDocPost } from '../hrd-doc/route';
import { POST as deliveryPhotoPost } from '../delivery-photo/route';

const redirectError = () =>
    Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

function makeRequest() {
    const data = new FormData();
    data.append('file', new File(['img'], 'photo.jpg', { type: 'image/jpeg' }));
    data.append('entityId', 'ent-1');
    data.append('deliveryOrderId', 'do-1');
    data.append('photoType', 'vehicle');
    return {
        formData: vi.fn(async () => data),
    } as unknown as NextRequest;
}

const routes = [
    { name: 'upload', post: uploadPost },
    { name: 'hrd-doc', post: hrdDocPost },
    { name: 'delivery-photo', post: deliveryPhotoPost },
];

describe.each(routes)('POST $name — sesi habis', ({ post }) => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireModuleFromRequest.mockResolvedValue(null);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('melempar ulang redirect login, bukan respons 500', async () => {
        mocks.requireAuth.mockRejectedValue(redirectError());
        await expect(post(makeRequest())).rejects.toThrow('NEXT_REDIRECT');
        expect(mocks.uploadToR2).not.toHaveBeenCalled();
    });

    it('error biasa tetap dijawab 500', async () => {
        mocks.requireAuth.mockRejectedValue(new Error('boom'));
        const res = await post(makeRequest());
        expect(res.status).toBe(500);
    });
});
