import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma, mockPurchaseService, mockAutoJournalService, mockApproveWalkIn, mockRejectWalkIn } = vi.hoisted(() => {
    const mockPrisma = {};
    const mockPurchaseService = {
        createOrder: vi.fn(),
        updateOrder: vi.fn(),
        createInvoice: vi.fn(),
        recordPayment: vi.fn(),
        updateOrderStatus: vi.fn(),
        deleteOrder: vi.fn(),
        getPurchaseOrders: vi.fn(),
        getPurchaseOrderById: vi.fn(),
        getGoodsReceiptById: vi.fn(),
        getGoodsReceipts: vi.fn(),
        getPurchaseInvoiceById: vi.fn(),
        getPurchaseInvoices: vi.fn(),
        updatePurchaseInvoiceDueDate: vi.fn(),
    };
    const mockAutoJournalService = {
        handlePurchaseInvoiceCreated: vi.fn().mockResolvedValue(undefined),
        handlePurchasePayment: vi.fn().mockResolvedValue(undefined),
    };
    const mockApproveWalkIn = vi.fn();
    const mockRejectWalkIn = vi.fn();
    return { mockPrisma, mockPurchaseService, mockAutoJournalService, mockApproveWalkIn, mockRejectWalkIn };
});

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            const data = await fn();
            return { success: true as const, data };
        } catch (e) {
            if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
            return {
                success: false as const,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    },
    BusinessRuleError: class BusinessRuleError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'BusinessRuleError';
        }
    },
}));
vi.mock('@/services/purchasing/purchase-service', () => ({
    PurchaseService: mockPurchaseService,
}));
vi.mock('@/services/finance/auto-journal-service', () => ({
    AutoJournalService: mockAutoJournalService,
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/utils/utils', () => ({
    serializeData: (d: unknown) => d,
}));
vi.mock('@/lib/schemas/purchasing', () => ({
    createPurchaseOrderSchema: { parse: (d: unknown) => d },
    updatePurchaseOrderSchema: { parse: (d: unknown) => d },
    createGoodsReceiptSchema: { parse: (d: unknown) => d },
    createPurchaseInvoiceSchema: { parse: (d: unknown) => d },
    createWalkInReceiptSchema: { parse: (d: unknown) => d },
    createPurchaseRequestSchema: { parse: (d: unknown) => d },
}));
vi.mock('@/services/purchasing/walk-in-receipt-service', () => ({
    approveWalkInInvoice: (...args: unknown[]) => mockApproveWalkIn(...args),
    rejectWalkInInvoice: (...args: unknown[]) => mockRejectWalkIn(...args),
}));

const mockRequirePurchasingAccess = vi.fn();
const mockRequirePurchasingFinance = vi.fn();
const mockRequirePurchasingCreator = vi.fn();
const mockRequirePurchasingApprover = vi.fn();
const mockRequireWarehouseResourcePermission = vi.fn();

vi.mock('@/lib/auth/purchasing-access', () => ({
    requirePurchasingAccess: (...args: unknown[]) => mockRequirePurchasingAccess(...args),
    requirePurchasingApprover: (...args: unknown[]) => mockRequirePurchasingApprover(...args),
    requirePurchasingFinance: (...args: unknown[]) => mockRequirePurchasingFinance(...args),
    requirePurchasingCreator: (...args: unknown[]) => mockRequirePurchasingCreator(...args),
    requirePurchasingAnalyticsRead: vi.fn(),
}));
vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
    requireWarehouseResourcePermission: (...args: unknown[]) =>
        mockRequireWarehouseResourcePermission(...args),
}));
vi.mock('@/lib/auth/roles', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/roles')>('@/lib/auth/roles');
    return { ...actual };
});

import {
    createPurchaseOrder,
    updatePurchaseOrder,
    createPurchaseInvoice,
    recordPurchasePayment,
    updatePurchaseOrderStatus,
    deletePurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    getGoodsReceiptById,
    getGoodsReceipts,
    getPurchaseInvoiceById,
    getPurchaseInvoices,
    approveWalkInPurchaseInvoice,
    rejectWalkInPurchaseInvoice,
    updatePurchaseInvoiceDueDate,
} from '../purchasing';

function session(userId: string, roles: string[]) {
    return {
        user: { id: userId, name: `User ${userId}`, role: roles[0], roles },
    } as any;
}

describe('purchasing.ts remaining auth guards', () => {
    beforeEach(() => vi.clearAllMocks());

    // ─── PO CRUD: requirePurchasingAccess ───

    describe('createPurchaseOrder', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await createPurchaseOrder({ items: [] } as any);
            expect(result.success).toBe(false);
        });
        it('allows ADMIN', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['ADMIN']));
            mockPurchaseService.createOrder.mockResolvedValue({ id: 'po-1', orderNumber: 'PO-001' });
            const result = await createPurchaseOrder({ items: [] } as any);
            expect(result.success).toBe(true);
        });
        it('allows PLANNING', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['PLANNING']));
            mockPurchaseService.createOrder.mockResolvedValue({ id: 'po-1', orderNumber: 'PO-001' });
            const result = await createPurchaseOrder({ items: [] } as any);
            expect(result.success).toBe(true);
        });
        it('rejects FINANCE', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await createPurchaseOrder({ items: [] } as any);
            expect(result.success).toBe(false);
        });
    });

    describe('updatePurchaseOrder', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await updatePurchaseOrder({ id: 'po-1' } as any);
            expect(result.success).toBe(false);
        });
        it('allows PROCUREMENT', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['PROCUREMENT']));
            mockPurchaseService.updateOrder.mockResolvedValue({ id: 'po-1', orderNumber: 'PO-001' });
            const result = await updatePurchaseOrder({ id: 'po-1' } as any);
            expect(result.success).toBe(true);
        });
    });

    describe('updatePurchaseOrderStatus', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await updatePurchaseOrderStatus('po-1', 'SENT' as any);
            expect(result.success).toBe(false);
        });
        it('allows ADMIN', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['ADMIN']));
            mockPurchaseService.updateOrderStatus.mockResolvedValue({ id: 'po-1' });
            const result = await updatePurchaseOrderStatus('po-1', 'SENT' as any);
            expect(result.success).toBe(true);
        });
    });

    describe('deletePurchaseOrder', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await deletePurchaseOrder('po-1');
            expect(result.success).toBe(false);
        });
        it('allows PLANNING', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['PLANNING']));
            mockPurchaseService.deleteOrder.mockResolvedValue({ orderNumber: 'PO-001' });
            const result = await deletePurchaseOrder('po-1');
            expect(result.success).toBe(true);
        });
    });

    // ─── PO reads: requirePurchasingAccess ───

    describe('getPurchaseOrders', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await getPurchaseOrders();
            expect(result.success).toBe(false);
        });
        it('allows PROCUREMENT', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['PROCUREMENT']));
            mockPurchaseService.getPurchaseOrders.mockResolvedValue([]);
            const result = await getPurchaseOrders();
            expect(result.success).toBe(true);
        });
    });

    describe('getPurchaseOrderById', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await getPurchaseOrderById('po-1');
            expect(result.success).toBe(false);
        });
        it('allows ADMIN', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['ADMIN']));
            mockPurchaseService.getPurchaseOrderById.mockResolvedValue({ id: 'po-1' });
            const result = await getPurchaseOrderById('po-1');
            expect(result.success).toBe(true);
        });
    });

    describe('getGoodsReceiptById', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await getGoodsReceiptById('gr-1');
            expect(result.success).toBe(false);
        });
        it('allows PLANNING', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['PLANNING']));
            mockPurchaseService.getGoodsReceiptById.mockResolvedValue({ id: 'gr-1' });
            const result = await getGoodsReceiptById('gr-1');
            expect(result.success).toBe(true);
        });
    });

    describe('getGoodsReceipts', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await getGoodsReceipts();
            expect(result.success).toBe(false);
        });
        it('allows ADMIN', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['ADMIN']));
            mockPurchaseService.getGoodsReceipts.mockResolvedValue([]);
            const result = await getGoodsReceipts();
            expect(result.success).toBe(true);
        });
    });

    describe('getPurchaseInvoiceById', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await getPurchaseInvoiceById('inv-1');
            expect(result.success).toBe(false);
        });
        it('allows PROCUREMENT', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['PROCUREMENT']));
            mockPurchaseService.getPurchaseInvoiceById.mockResolvedValue({ id: 'inv-1' });
            const result = await getPurchaseInvoiceById('inv-1');
            expect(result.success).toBe(true);
        });
    });

    describe('getPurchaseInvoices', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(new Error('Unauthorized'));
            const result = await getPurchaseInvoices();
            expect(result.success).toBe(false);
        });
        it('allows ADMIN', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(session('u1', ['ADMIN']));
            mockPurchaseService.getPurchaseInvoices.mockResolvedValue([]);
            const result = await getPurchaseInvoices();
            expect(result.success).toBe(true);
        });
    });

    // ─── Finance actions: requirePurchasingFinance ───

    describe('createPurchaseInvoice', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingFinance.mockRejectedValue(new Error('Unauthorized'));
            const result = await createPurchaseInvoice({ purchaseOrderId: 'po-1' } as any);
            expect(result.success).toBe(false);
        });
        it('allows FINANCE', async () => {
            mockRequirePurchasingFinance.mockResolvedValue(session('u1', ['FINANCE']));
            mockPurchaseService.createInvoice.mockResolvedValue({ id: 'inv-1' });
            const result = await createPurchaseInvoice({ purchaseOrderId: 'po-1' } as any);
            expect(result.success).toBe(true);
        });
        it('rejects PLANNING', async () => {
            mockRequirePurchasingFinance.mockRejectedValue(
                new Error('Unauthorized: Akses finance purchasing hanya untuk admin atau finance.'),
            );
            const result = await createPurchaseInvoice({ purchaseOrderId: 'po-1' } as any);
            expect(result.success).toBe(false);
        });
    });

    describe('recordPurchasePayment', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingFinance.mockRejectedValue(new Error('Unauthorized'));
            const result = await recordPurchasePayment('inv-1', 100000);
            expect(result.success).toBe(false);
        });
        it('allows FINANCE', async () => {
            mockRequirePurchasingFinance.mockResolvedValue(session('u1', ['FINANCE']));
            mockPurchaseService.recordPayment.mockResolvedValue({ paymentId: 'pay-1' });
            const result = await recordPurchasePayment('inv-1', 100000);
            expect(result.success).toBe(true);
        });
        it('rejects PROCUREMENT', async () => {
            mockRequirePurchasingFinance.mockRejectedValue(
                new Error('Unauthorized: Akses finance purchasing hanya untuk admin atau finance.'),
            );
            const result = await recordPurchasePayment('inv-1', 100000);
            expect(result.success).toBe(false);
        });
    });

    // ─── Walk-in invoice actions: already inline ADMIN|FINANCE (leave as-is) ───

    describe('approveWalkInPurchaseInvoice (existing guard — unchanged)', () => {
        it('rejects when no session', async () => {
            mockRequireWarehouseResourcePermission.mockResolvedValue(undefined);
            // These use inline hasAnyRole + requireAuth — we mock requireAuth via auth-checks
            const { requireAuth } = await import('@/lib/tools/auth-checks');
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            const result = await approveWalkInPurchaseInvoice('inv-1');
            expect(result.success).toBe(false);
        });
    });

    describe('rejectWalkInPurchaseInvoice (existing guard — unchanged)', () => {
        it('rejects when no session', async () => {
            const { requireAuth } = await import('@/lib/tools/auth-checks');
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            const result = await rejectWalkInPurchaseInvoice('inv-1', 'defect');
            expect(result.success).toBe(false);
        });
    });

    describe('updatePurchaseInvoiceDueDate (existing inline ADMIN|FINANCE — unchanged)', () => {
        it('rejects when no session', async () => {
            const { requireAuth } = await import('@/lib/tools/auth-checks');
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            const result = await updatePurchaseInvoiceDueDate('inv-1', { dueDate: '2026-12-01' });
            expect(result.success).toBe(false);
        });
    });
});
