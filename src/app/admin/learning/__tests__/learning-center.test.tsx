// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ review: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/admin/product-learning', () => ({ reviewLearning: mocks.review }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { LearningCenter } from '../learning-center';
import type { getProductLearningOverview } from '@/services/admin/product-learning.service';
type Data = Awaited<ReturnType<typeof getProductLearningOverview>>;
const base = (): Data => ({ health: 'DISABLED', configuration: { enabled: false, reason: 'DISABLED' }, runs: [], findings: [] });
const row = () => ({ id: 'test-finding', domain: 'PRODUCT', metricKey: 'help_failure_share', policyVersion: 'test-v1', ruleVersion: 'product-reliability-v1', status: 'OPEN', latestNumerator: 10, latestDenominator: 20, lastSeenDay: new Date('2026-10-17'), occurrences: 1 });
beforeEach(() => { vi.resetAllMocks(); mocks.review.mockResolvedValue({ success: true }); });
afterEach(cleanup);
describe('learning center UI', () => {
    it('shows honest disabled/empty state and unavailable domains', () => {
        render(<LearningCenter data={base()} />);
        expect(screen.getByText(/Nonaktif/)).toBeTruthy();
        expect(screen.getByText(/Belum ada temuan/)).toBeTruthy();
        expect(screen.getByText('Marketing · belum diaktifkan')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Unduh brief pengembangan' }).getAttribute('href')).toBe('/api/admin/learning/export');
    });
    it('filters developer briefs and submits review with feedback', async () => {
        const data = { ...base(), configuration: { enabled: true, version: 'test-v1', activeFrom: new Date(), retentionDays: 90, closedRetentionDays: 180 }, findings: [row()] } as Data;
        render(<LearningCenter data={data} />);
        fireEvent.click(screen.getByRole('button', { name: 'Terima untuk investigasi' }));
        await waitFor(() => expect(mocks.review).toHaveBeenCalledWith({ id: 'test-finding', action: 'accept' }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('tersimpan'));
        fireEvent.change(screen.getByLabelText('Filter area'), { target: { value: 'mobile' } });
        expect(screen.getByRole('link', { name: 'Unduh brief pengembangan' }).getAttribute('href')).toContain('module=mobile');
        expect(screen.queryByRole('button', { name: 'Terima untuk investigasi' })).toBeNull();
    });
    it('shows failure and records structured intervention, never an improved status on click', async () => {
        mocks.review.mockResolvedValue({ success: false, error: 'Status berubah' });
        const data = { ...base(), configuration: { enabled: true, version: 'test-v1', activeFrom: new Date(), retentionDays: 90, closedRetentionDays: 180 }, findings: [{ ...row(), status: 'ACCEPTED' }] } as Data;
        render(<LearningCenter data={data} />);
        fireEvent.change(screen.getByLabelText('Commit SHA rilis (40 karakter)'), { target: { value: 'a'.repeat(40) } });
        fireEvent.change(screen.getByLabelText(/Path regression test/), { target: { value: 'src/lib/__tests__/example.test.ts' } });
        fireEvent.submit(screen.getByRole('button', { name: 'Catat intervensi dan mulai pengukuran' }).closest('form')!);
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Status berubah'));
        expect(screen.queryByText(/Rasio teramati membaik/)).toBeNull();
    });
});
