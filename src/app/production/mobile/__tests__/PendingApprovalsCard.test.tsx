// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PendingApprovalsCard } from '../PendingApprovalsCard';
import type { ProductionMobilePendingApprovals } from '@/services/production/production-mobile-dashboard-service';

afterEach(cleanup);

function approvals(
    overrides: Partial<ProductionMobilePendingApprovals> = {},
): ProductionMobilePendingApprovals {
    return {
        maintenance: { status: 'AVAILABLE', data: { count: 3 } },
        materialOrders: { status: 'AVAILABLE', data: { count: 2 } },
        links: {
            maintenance: '/production/mobile/maintenance',
            materialOrders: '/production/mobile/material-orders',
        },
        ...overrides,
    };
}

describe('PendingApprovalsCard', () => {
    it('shows both counts with links to their lists', () => {
        render(<PendingApprovalsCard approvals={approvals()} />);

        expect(screen.getByText('Menunggu persetujuan Anda')).toBeTruthy();
        const maintenance = screen.getByRole('link', { name: /Perawatan mesin/ });
        const orders = screen.getByRole('link', { name: /Permintaan bahan/ });
        expect(maintenance.getAttribute('href')).toBe('/production/mobile/maintenance');
        expect(maintenance.textContent).toContain('3');
        expect(orders.getAttribute('href')).toBe('/production/mobile/material-orders');
        expect(orders.textContent).toContain('2');
    });

    it('renders no link when the path cannot be opened', () => {
        render(
            <PendingApprovalsCard
                approvals={approvals({
                    links: {
                        maintenance: null,
                        materialOrders: '/production/mobile/material-orders',
                    },
                })}
            />,
        );

        expect(screen.queryByRole('link', { name: /Perawatan mesin/ })).toBeNull();
        expect(screen.getByText('Perawatan mesin').parentElement?.textContent).toContain('3');
    });

    it('marks an unavailable count instead of showing zero', () => {
        render(
            <PendingApprovalsCard
                approvals={approvals({
                    maintenance: { status: 'UNAVAILABLE', data: null },
                })}
            />,
        );

        expect(screen.getByRole('status').textContent).toContain('Perawatan mesin');
        expect(screen.getByRole('link', { name: /Permintaan bahan/ }).textContent).toContain('2');
    });
});
