import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSummaryAction } = vi.hoisted(() => ({
    mockSummaryAction: vi.fn(),
}));

vi.mock('@/actions/sales/customer', () => ({
    getCustomersWithCreditSummaryAction: mockSummaryAction,
}));

vi.mock('../CustomersPageClient', () => ({
    default: function MockCustomersPageClient() {
        return null;
    },
}));

import CustomersPage from '../page';

const pageData = {
    customers: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
    search: '',
    filter: 'all' as const,
};

describe('CustomersPage server pagination', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSummaryAction.mockResolvedValue({ success: true, data: pageData });
    });

    it('passes URL-backed search, filter, page, and capped page size to the action', async () => {
        const element = await CustomersPage({
            searchParams: Promise.resolve({
                q: '  toko  ',
                filter: 'inactive',
                page: '3',
                pageSize: '500',
            }),
        });

        expect(mockSummaryAction).toHaveBeenCalledWith({
            search: 'toko',
            filter: 'inactive',
            page: 3,
            pageSize: 100,
        });
        expect(element.props.pageData).toBe(pageData);
        expect(element.props.error).toBeUndefined();
    });

    it('uses safe defaults for malformed or repeated URL values', async () => {
        await CustomersPage({
            searchParams: Promise.resolve({
                q: ['first', 'second'],
                filter: 'not-a-filter',
                page: '-2',
                pageSize: 'invalid',
            }),
        });

        expect(mockSummaryAction).toHaveBeenCalledWith({
            search: '',
            filter: 'all',
            page: 1,
            pageSize: 50,
        });
    });

    it('renders an explicit error state when the action fails', async () => {
        mockSummaryAction.mockResolvedValue({
            success: false,
            error: 'Daftar customer tidak tersedia',
        });

        const element = await CustomersPage({
            searchParams: Promise.resolve({ q: 'ade' }),
        });

        expect(element.props.error).toBe('Daftar customer tidak tersedia');
        expect(element.props.pageData).toMatchObject({
            customers: [],
            total: 0,
            search: 'ade',
        });
    });
});
