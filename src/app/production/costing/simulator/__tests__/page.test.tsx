// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../page';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    options: vi.fn(),
    defaults: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: unknown) => fn,
}));
vi.mock('@/lib/auth/hpp-price-simulator-access', () => ({
    requireHppPriceSimulatorAccess: mocks.guard,
}));
vi.mock('@/actions/production/hpp-price-simulator-query', () => ({
    readHppPriceSimulatorVariantOptions: mocks.options,
    readHppPriceSimulatorDefault: mocks.defaults,
}));
vi.mock('../SimulatorClient', () => ({
    SimulatorClient: ({ options }: { options: unknown[] }) => (
        <div data-testid="simulator-client">{options.length}</div>
    ),
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.ComponentProps<'a'>) => (
        <a {...props}>{children}</a>
    ),
}));

const db = { productVariant: {}, bom: {}, user: {}, rolePermission: {} };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.guard.mockResolvedValue({ db, userId: 'admin-1', roles: ['ADMIN'] });
    mocks.options.mockResolvedValue([
        {
            id: 'variant-a',
            name: 'Produk A',
            skuCode: 'A',
            primaryOutputUnit: 'PCS',
            defaultBom: { id: 'bom-a', name: 'BOM A', outputQuantity: 1 },
        },
    ]);
    mocks.defaults.mockResolvedValue({ variant: { id: 'variant-a' } });
});

describe('HPP simulator page', () => {
    it('guards before the dedicated reads and renders the read-only shell', async () => {
        render(await Page());

        expect(mocks.guard).toHaveBeenCalledOnce();
        expect(mocks.options).toHaveBeenCalledWith(db);
        expect(mocks.defaults).toHaveBeenCalledWith(db, 'variant-a');
        expect(
            screen.getByRole('heading', { name: 'Simulator HPP & Harga' }),
        ).toBeDefined();
        expect(screen.getByText('Simulasi read-only')).toBeDefined();
        expect(screen.getByTestId('simulator-client').textContent).toBe('1');
    });

    it('fails closed without running any read when access is denied', async () => {
        mocks.guard.mockRejectedValue(new Error('denied'));

        await expect(Page()).rejects.toThrow('denied');
        expect(mocks.options).not.toHaveBeenCalled();
        expect(mocks.defaults).not.toHaveBeenCalled();
    });
});
