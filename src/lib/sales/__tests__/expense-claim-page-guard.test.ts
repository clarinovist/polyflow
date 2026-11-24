import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { BusinessRuleError } from '@/lib/errors/errors';
import { guardClaimPage } from '../expense-claim-page-guard';

describe('guardClaimPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        m.redirect.mockImplementation((path: string) => {
            throw new Error(`NEXT_REDIRECT:${path}`);
        });
    });

    it('lets the page render when the role check passes', async () => {
        const check = vi.fn().mockResolvedValue({});

        await expect(guardClaimPage(check)).resolves.toBeUndefined();

        expect(check).toHaveBeenCalledOnce();
        expect(m.redirect).not.toHaveBeenCalled();
    });

    it('redirects to the unauthorized dashboard when the role check rejects', async () => {
        const check = vi
            .fn()
            .mockRejectedValue(new BusinessRuleError('Unauthorized'));

        await expect(guardClaimPage(check)).rejects.toThrow(
            'NEXT_REDIRECT:/dashboard?error=Unauthorized',
        );
    });

    it('does not turn unexpected failures into a redirect', async () => {
        const check = vi.fn().mockRejectedValue(new Error('db down'));

        await expect(guardClaimPage(check)).rejects.toThrow('db down');
        expect(m.redirect).not.toHaveBeenCalled();
    });
});
