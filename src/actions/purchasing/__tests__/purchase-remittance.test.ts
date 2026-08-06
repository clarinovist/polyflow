import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        purchaseInvoice: {
            findMany: vi.fn().mockResolvedValue([]),
        },
    },
}));

vi.mock('@/services/purchasing/purchase-remittance-service', () => ({
    createPurchaseRemittance: vi
        .fn()
        .mockResolvedValue({ id: 'prem-1', remittanceNumber: 'PREM-2026-08-0001' }),
    verifyPurchaseRemittance: vi.fn().mockResolvedValue({
        remittanceId: 'prem-1',
        remittanceNumber: 'PREM-2026-08-0001',
        successCount: 1,
        failedCount: 0,
        items: [],
    }),
    rejectPurchaseRemittance: vi
        .fn()
        .mockResolvedValue({ id: 'prem-1', remittanceNumber: 'PREM-2026-08-0001' }),
    listPurchaseRemittances: vi
        .fn()
        .mockResolvedValue([{ id: 'prem-1', remittanceNumber: 'PREM-2026-08-0001' }]),
}));

vi.mock('@/lib/auth/purchasing-access', () => ({
    requirePurchasingRemittanceCreator: vi.fn().mockResolvedValue({
        user: { id: 'u1', role: 'PROCUREMENT' },
    }),
    requirePurchasingFinance: vi.fn().mockResolvedValue({
        user: { id: 'admin', role: 'ADMIN' },
    }),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (d: unknown) => d,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', async () => {
    const actual = (await vi.importActual('@/lib/errors/errors')) as any;
    return {
        ...actual,
        safeAction: async (fn: () => Promise<unknown>) => {
            try {
                const data = await fn();
                return { success: true, data };
            } catch (e: any) {
                return { success: false, error: e.message, code: e.code };
            }
        },
    };
});

// Imports after mocks
import { prisma } from '@/lib/core/prisma';
import {
    requirePurchasingRemittanceCreator,
    requirePurchasingFinance,
} from '@/lib/auth/purchasing-access';
import {
    createPurchaseRemittance,
    verifyPurchaseRemittance,
    rejectPurchaseRemittance,
    listPurchaseRemittances,
} from '@/services/purchasing/purchase-remittance-service';
import {
    createPurchaseRemittanceAction,
    verifyPurchaseRemittanceAction,
    rejectPurchaseRemittanceAction,
    listPurchaseRemittancesAction,
    listPurchaseRemittancesForVerificationAction,
    listOutstandingPurchaseInvoicesAction,
} from '../purchase-remittance';

describe('purchase-remittance actions — guard + scoping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requirePurchasingRemittanceCreator).mockResolvedValue({
            user: { id: 'u1', role: 'PROCUREMENT' },
        } as any);
        vi.mocked(requirePurchasingFinance).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN' },
        } as any);
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([] as never);
    });

    describe('createPurchaseRemittanceAction — userId forced from session', () => {
        it('WAREHOUSE bisa ajukan, userId dipaksa dari session', async () => {
            vi.mocked(requirePurchasingRemittanceCreator).mockResolvedValue({
                user: { id: 'wh-1', role: 'WAREHOUSE' },
            } as any);

            const res = await createPurchaseRemittanceAction({
                userId: 'someone-else',
                paidAt: new Date('2026-08-02'),
                items: [
                    { purchaseInvoiceId: 'pinv-1', amount: 100, method: 'Cash' },
                ],
            } as any);

            expect(res.success).toBe(true);
            expect(createPurchaseRemittance).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'wh-1' }),
            );
        });

        it('PLANNING ditolak guard requirePurchasingRemittanceCreator', async () => {
            vi.mocked(requirePurchasingRemittanceCreator).mockRejectedValue(
                new Error(
                    'Unauthorized: Hanya admin, procurement, atau warehouse yang dapat mengajukan setoran pembayaran supplier.',
                ),
            );

            const res = await createPurchaseRemittanceAction({
                paidAt: new Date('2026-08-02'),
                items: [
                    { purchaseInvoiceId: 'pinv-1', amount: 100, method: 'Cash' },
                ],
            } as any);

            expect(res.success).toBe(false);
        });
    });

    describe('verifyPurchaseRemittanceAction — guard requirePurchasingFinance', () => {
        it('PROCUREMENT ditolak (bukan finance)', async () => {
            vi.mocked(requirePurchasingFinance).mockRejectedValue(
                new Error(
                    'Unauthorized: Akses finance purchasing hanya untuk admin atau finance.',
                ),
            );

            const res = await verifyPurchaseRemittanceAction({
                remittanceId: 'prem-1',
            });
            expect(res.success).toBe(false);
        });

        it('FINANCE bisa verifikasi', async () => {
            vi.mocked(requirePurchasingFinance).mockResolvedValue({
                user: { id: 'fin-1', role: 'FINANCE' },
            } as any);

            const res = await verifyPurchaseRemittanceAction({
                remittanceId: 'prem-1',
            });
            expect(res.success).toBe(true);
            expect(verifyPurchaseRemittance).toHaveBeenCalledWith(
                'prem-1',
                'fin-1',
                undefined,
            );
        });
    });

    describe('rejectPurchaseRemittanceAction — guard requirePurchasingFinance', () => {
        it('FINANCE bisa tolak dengan alasan', async () => {
            vi.mocked(requirePurchasingFinance).mockResolvedValue({
                user: { id: 'fin-1', role: 'FINANCE' },
            } as any);

            const res = await rejectPurchaseRemittanceAction({
                remittanceId: 'prem-1',
                reason: 'Bukti tidak jelas',
            });
            expect(res.success).toBe(true);
            expect(rejectPurchaseRemittance).toHaveBeenCalledWith(
                'prem-1',
                'fin-1',
                'Bukti tidak jelas',
            );
        });
    });

    describe('listPurchaseRemittancesAction — creator-scoped, userId selalu dipaksa', () => {
        it('userId selalu di-set dari session, filter caller diabaikan', async () => {
            const res = await listPurchaseRemittancesAction({
                userId: 'someone-else',
            } as any);
            expect(res.success).toBe(true);
            expect(listPurchaseRemittances).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'u1' }),
            );
        });

        it('requires creator guard', async () => {
            vi.mocked(requirePurchasingRemittanceCreator).mockRejectedValue(
                new Error('Unauthorized'),
            );
            const res = await listPurchaseRemittancesAction({} as any);
            expect(res.success).toBe(false);
        });
    });

    describe('listPurchaseRemittancesForVerificationAction — FINANCE-only, unscoped', () => {
        it('FINANCE list semua tanpa userId filter', async () => {
            vi.mocked(requirePurchasingFinance).mockResolvedValue({
                user: { id: 'fin-1', role: 'FINANCE' },
            } as any);

            const res = await listPurchaseRemittancesForVerificationAction({
                status: 'PENDING',
            } as any);

            expect(res.success).toBe(true);
            expect(listPurchaseRemittances).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'PENDING' }),
            );
            expect(listPurchaseRemittances).not.toHaveBeenCalledWith(
                expect.objectContaining({ userId: expect.anything() }),
            );
        });

        it('PROCUREMENT (creator-only role) ditolak guard finance', async () => {
            vi.mocked(requirePurchasingFinance).mockRejectedValue(
                new Error(
                    'Unauthorized: Akses finance purchasing hanya untuk admin atau finance.',
                ),
            );
            const res = await listPurchaseRemittancesForVerificationAction(
                {} as any,
            );
            expect(res.success).toBe(false);
        });
    });

    describe('listOutstandingPurchaseInvoicesAction', () => {
        it('WAREHOUSE bisa ambil daftar invoice outstanding (guard creator, bukan finance-only)', async () => {
            vi.mocked(requirePurchasingRemittanceCreator).mockResolvedValue({
                user: { id: 'wh-1', role: 'WAREHOUSE' },
            } as any);
            vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([
                {
                    id: 'pinv-1',
                    invoiceNumber: 'PINV-1',
                    totalAmount: 1000,
                    paidAmount: 200,
                    status: 'PARTIAL',
                    purchaseOrder: {
                        orderNumber: 'PO-1',
                        supplier: { name: 'Supplier A' },
                    },
                },
                {
                    id: 'pinv-2',
                    invoiceNumber: 'PINV-2',
                    totalAmount: 500,
                    paidAmount: 500,
                    status: 'PAID',
                    purchaseOrder: {
                        orderNumber: 'PO-2',
                        supplier: { name: 'Supplier B' },
                    },
                },
            ] as never);

            const res = await listOutstandingPurchaseInvoicesAction();
            expect(res.success).toBe(true);
            // Fully-paid invoice filtered out even if status somehow slipped through
            const data = (res as { success: true; data: any[] }).data;
            expect(data.length).toBe(1);
            expect(data[0].id).toBe('pinv-1');
        });
    });
});
