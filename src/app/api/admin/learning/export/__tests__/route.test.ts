import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: vi.fn(), overview: vi.fn(), brief: vi.fn() }));
vi.mock('@/lib/learning/authorization', () => ({ requireLearningOwner: mocks.owner }));
vi.mock('@/services/admin/product-learning.service', () => ({ getProductLearningOverview: mocks.overview, learningBrief: mocks.brief }));
import { GET } from '../route';
beforeEach(() => { vi.resetAllMocks(); mocks.owner.mockResolvedValue('owner'); });
describe('restricted developer export', () => {
    it('rejects unauthorized and unsupported filters', async () => {
        mocks.owner.mockRejectedValueOnce(new Error('denied'));
        expect((await GET(new Request('http://localhost/api/admin/learning/export'))).status).toBe(403);
        expect((await GET(new Request('http://localhost/api/admin/learning/export?module=pricing'))).status).toBe(400);
        expect(mocks.overview).not.toHaveBeenCalled();
    });
    it('returns private no-store evidence and hides failure details', async () => {
        mocks.overview.mockResolvedValue({ findings: [] }); mocks.brief.mockReturnValue('# Evidence');
        const response = await GET(new Request('http://localhost/api/admin/learning/export?module=mobile'));
        expect(await response.text()).toBe('# Evidence');
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(mocks.brief).toHaveBeenCalledWith([], 'mobile');
        mocks.overview.mockRejectedValueOnce(new Error('secret'));
        const failed = await GET(new Request('http://localhost/api/admin/learning/export'));
        expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('secret');
    });
});
