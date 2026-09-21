// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductionResourcesPage from '@/app/production/resources/page';
vi.mock('@/actions/admin/employees', () => ({ getEmployees: async () => ({ success: true, data: [{ id: 'test-employee', name: 'Test operator', code: 'TEST-01', status: 'ACTIVE' }] }) }));
afterEach(cleanup);
describe('production team directory', () => {
    it('describes the actual directory and links real shift settings without a fictitious active shift', async () => {
        render(await ProductionResourcesPage());
        expect(screen.getByRole('heading', { name: 'Tim' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Buka Pengaturan Shift' }).getAttribute('href')).toBe('/production/shifts');
        expect(screen.queryByText('Shift Aktif')).toBeNull();
        expect(screen.queryByText(/Shift 1 \(Day\)/)).toBeNull();
        expect(screen.getByText('Test operator')).toBeTruthy();
    });
});
