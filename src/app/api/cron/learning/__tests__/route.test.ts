import { beforeEach, describe, expect, it, vi } from 'vitest';
const run = vi.hoisted(() => vi.fn());
const ownerRun = vi.hoisted(() => vi.fn());
vi.mock('@/services/admin/owner-learning.service', () => ({ runOwnerLearning: ownerRun }));
vi.mock('@/services/admin/product-learning.service', () => ({ runProductLearning: run }));
import { GET } from '../route';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret'); ownerRun.mockResolvedValue({ state: 'DISABLED', processed: 0 }); });
describe('learning cron', () => {
    it('fails closed before accessing data', async () => {
        expect((await GET(new Request('http://localhost/api/cron/learning'))).status).toBe(401);
        vi.stubEnv('CRON_SECRET', '');
        expect((await GET(new Request('http://localhost/api/cron/learning'))).status).toBe(401);
        expect(run).not.toHaveBeenCalled();
    });
    it.each([['DISABLED', 200], ['COMPLETE', 200], ['FAILED', 503], ['POLICY_REQUIRED', 503], ['POLICY_CONFLICT', 503]])('reports %s with %i', async (state, status) => {
        run.mockResolvedValue({ state, processed: 0 });
        const response = await GET(new Request('http://localhost/api/cron/learning', { headers: { authorization: 'Bearer synthetic-cron-secret' } }));
        expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('no-store');
    });
    it('preserves global collection when an owner tenant fails', async () => {
        run.mockResolvedValue({ state: 'COMPLETE', processed: 1 });
        ownerRun.mockResolvedValue({ state: 'PARTIAL_FAILED', processed: 0 });
        const response = await GET(new Request('http://localhost/api/cron/learning', { headers: { authorization: 'Bearer synthetic-cron-secret' } }));
        expect(response.status).toBe(503);
        expect((await response.json()).state).toBe('COMPLETE');
    });
    it('does not leak raw errors', async () => {
        run.mockRejectedValue(new Error('private database details'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = await GET(new Request('http://localhost/api/cron/learning', { headers: { authorization: 'Bearer synthetic-cron-secret' } }));
        expect(await response.json()).toEqual({ state: 'JOB_FAILED', processed: 0, owner: { state: 'DISABLED', processed: 0 } });
        expect(JSON.stringify(log.mock.calls)).not.toContain('private database'); log.mockRestore();
    });
});
