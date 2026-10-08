import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
import SystemHealthLayout from '../layout';

describe('system health layout', () => {
    beforeEach(() => { mocks.auth.mockReset(); mocks.redirect.mockReset(); });
    it('redirects tenant admins away from operations diagnostics', async () => {
        mocks.auth.mockResolvedValue({ user: { role: 'ADMIN', isSuperAdmin: false } });
        await SystemHealthLayout({ children: <div>hidden</div> });
        expect(mocks.redirect).toHaveBeenCalledWith('/dashboard');
    });
    it('renders for super admins', async () => {
        mocks.auth.mockResolvedValue({ user: { role: 'ADMIN', isSuperAdmin: true } });
        const result = await SystemHealthLayout({ children: <div>visible</div> });
        expect(result).toEqual(<div>visible</div>);
        expect(mocks.redirect).not.toHaveBeenCalled();
    });
});
