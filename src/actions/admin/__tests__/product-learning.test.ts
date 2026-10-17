import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: vi.fn(), overview: vi.fn(), review: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/learning/authorization', () => ({ requireLearningOwner: mocks.owner }));
vi.mock('@/services/admin/product-learning.service', () => ({ getProductLearningOverview: mocks.overview, reviewProductLearning: mocks.review }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { fetchProductLearning, reviewLearning } from '../product-learning';
beforeEach(() => { vi.resetAllMocks(); mocks.owner.mockResolvedValue('session-owner'); });
describe('learning actions', () => {
    it('authorizes every read and write', async () => {
        mocks.owner.mockRejectedValue(new Error('forbidden'));
        await expect(fetchProductLearning()).rejects.toThrow();
        await expect(reviewLearning({ id: 'a', action: 'accept' })).rejects.toThrow();
        expect(mocks.overview).not.toHaveBeenCalled(); expect(mocks.review).not.toHaveBeenCalled();
    });
    it('returns only overview and validates mutation input', async () => {
        mocks.overview.mockResolvedValue({ health: 'DISABLED' });
        expect(await fetchProductLearning()).toEqual({ health: 'DISABLED' });
        expect((await reviewLearning({ id: '', action: 'accept' })).success).toBe(false);
        expect(mocks.review).not.toHaveBeenCalled();
    });
    it('uses session actor and hides internal errors', async () => {
        expect((await reviewLearning({ id: 'a', action: 'accept' })).success).toBe(true);
        expect(mocks.review).toHaveBeenCalledWith({ id: 'a', action: 'accept' }, 'session-owner');
        expect(mocks.revalidate).toHaveBeenCalledWith('/admin/learning');
        mocks.review.mockRejectedValueOnce(new Error('private SQL'));
        expect(JSON.stringify(await reviewLearning({ id: 'a', action: 'reject' }))).not.toContain('private SQL');
    });
});
