// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OwnerLearningView } from '../owner-learning-view';
import type { fetchOwnerLearning } from '@/actions/admin/owner-learning';
type Data = Awaited<ReturnType<typeof fetchOwnerLearning>>;
afterEach(cleanup);
const base = (): Data => ({ tenants: [{ id: 'a', name: 'Synthetic A' }], selectedId: 'a', health: 'AWAITING_COMPLETE_DAY', policyVersion: 'v1', activeFrom: new Date(), users: [], customers: [], variants: [], labelsAvailable: true, latest: null, snapshot: null, runs: [] });
describe('private owner view', () => {
    it('shows prospective empty state rather than fictional profiles', () => {
        render(<OwnerLearningView data={base()} />);
        expect(screen.getByText('Owner Insights')).toBeTruthy(); expect(screen.getByText(/Belum ada snapshot/)).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Synthetic A' }).getAttribute('href')).toContain('tenant=a');
    });
    it('labels usage as accounts and keeps money/physical/marketing meanings explicit', () => {
        const data = base(); data.snapshot = { schemaVersion: 1, usage: [{ userId: 'u', module: 'sales', views: 3, activeDays: 1, completed: 1, failed: 1, retries: 0 }], customers: [], prices: [], regions: [], movements: [], commerceState: 'OBSERVED', truncated: { usage: false, customers: false, prices: false, regions: false, movements: false }, suggestions: ['CHECK_MOBILE_FRICTION'] };
        data.users = [{ id: 'u', name: 'Synthetic account', role: 'SALES', isActive: true }];
        render(<OwnerLearningView data={data} />);
        expect(screen.getByText('Synthetic account')).toBeTruthy(); expect(screen.getByText(/Aktivitas akun, bukan penilaian/)).toBeTruthy();
        expect(screen.getByText(/bukan pendapatan bersih/)).toBeTruthy(); expect(screen.getByText(/Marketing: belum ada model atribusi/)).toBeTruthy();
    });
});
