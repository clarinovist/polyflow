import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks — must be declared before vi.mock calls
const { mockPrisma, mockPurchaseService } = vi.hoisted(() => {
    const mockPrisma = {
        purchaseRequest: {
            findMany: vi.fn(),
        },
    };
    const mockPurchaseService = {
        createPurchaseRequest: vi.fn(),
        approveRequest: vi.fn(),
        rejectRequest: vi.fn(),
        consolidateRequestsToOrder: vi.fn(),
    };
    return { mockPrisma, mockPurchaseService };
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

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

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/serialization/server-to-client', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/auth/roles', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/roles')>(
        '@/lib/auth/roles',
    );
    return { ...actual };
});

// We need separate mock implementations for different guard functions
// so tests can control which guard is used
const mockRequireAuth = vi.fn();
const mockRequirePurchasingCreator = vi.fn();
const mockRequirePurchasingApprover = vi.fn();

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock('@/lib/auth/purchasing-access', () => ({
    requirePurchasingCreator: (...args: unknown[]) =>
        mockRequirePurchasingCreator(...args),
    requirePurchasingApprover: (...args: unknown[]) =>
        mockRequirePurchasingApprover(...args),
    requirePurchasingAccess: vi.fn(),
    requirePurchasingFinance: vi.fn(),
    requirePurchasingAnalyticsRead: vi.fn(),
}));

// Import AFTER mocks
import type { CreatePurchaseRequestValues } from '@/lib/schemas/purchasing';

import {
    createManualPurchaseRequest,
    approvePurchaseRequest,
    rejectPurchaseRequest,
    getPurchaseRequests,
    consolidatePurchaseRequests,
} from '../purchasing';

// Helper to build a session
function session(
    userId: string,
    role: string,
    roles?: string[],
) {
    return {
        user: {
            id: userId,
            name: `User ${userId}`,
            role,
            roles: roles ?? [role],
        },
    } as any;
}

describe('purchase-request actions (action boundary)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ──────────────────────────────────────────────
    // createManualPurchaseRequest
    // ──────────────────────────────────────────────
    describe('createManualPurchaseRequest', () => {
        const validInput: CreatePurchaseRequestValues = {
            priority: 'NORMAL',
            notes: '',
            items: [
                {
                    productVariantId: 'pv-1',
                    quantity: 10,
                    notes: '',
                },
            ],
        };

        it('rejects when no session (guard before DB)', async () => {
            mockRequirePurchasingCreator.mockRejectedValue(
                new Error('No session'),
            );

            const result = await createManualPurchaseRequest(validInput);
            expect(result.success).toBe(false);
            expect(result.success === false && result.error).toContain(
                'No session',
            );
            expect(
                mockPurchaseService.createPurchaseRequest,
            ).not.toHaveBeenCalled();
        });

        it('allows ADMIN creator', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingCreator.mockResolvedValue(s);
            mockPurchaseService.createPurchaseRequest.mockResolvedValue({
                id: 'pr-1',
                requestNumber: 'PR-2026-0001',
            });

            const result = await createManualPurchaseRequest(validInput);
            expect(result.success).toBe(true);
            expect(
                mockPurchaseService.createPurchaseRequest,
            ).toHaveBeenCalledWith(validInput, 'u-admin');
        });

        it('allows PROCUREMENT creator', async () => {
            const s = session('u-proc', 'PROCUREMENT');
            mockRequirePurchasingCreator.mockResolvedValue(s);
            mockPurchaseService.createPurchaseRequest.mockResolvedValue({
                id: 'pr-2',
                requestNumber: 'PR-2026-0002',
            });

            const result = await createManualPurchaseRequest(validInput);
            expect(result.success).toBe(true);
        });

        it('allows PLANNING creator', async () => {
            const s = session('u-plan', 'PLANNING');
            mockRequirePurchasingCreator.mockResolvedValue(s);
            mockPurchaseService.createPurchaseRequest.mockResolvedValue({
                id: 'pr-3',
                requestNumber: 'PR-2026-0003',
            });

            const result = await createManualPurchaseRequest(validInput);
            expect(result.success).toBe(true);
        });

        it('allows WAREHOUSE creator', async () => {
            const s = session('u-wh', 'WAREHOUSE');
            mockRequirePurchasingCreator.mockResolvedValue(s);
            mockPurchaseService.createPurchaseRequest.mockResolvedValue({
                id: 'pr-4',
                requestNumber: 'PR-2026-0004',
            });

            const result = await createManualPurchaseRequest(validInput);
            expect(result.success).toBe(true);
        });

        it('allows PRODUCTION creator', async () => {
            const s = session('u-prod', 'PRODUCTION');
            mockRequirePurchasingCreator.mockResolvedValue(s);
            mockPurchaseService.createPurchaseRequest.mockResolvedValue({
                id: 'pr-5',
                requestNumber: 'PR-2026-0005',
            });

            const result = await createManualPurchaseRequest(validInput);
            expect(result.success).toBe(true);
        });

        it('rejects FINANCE (not a creator role)', async () => {
            mockRequirePurchasingCreator.mockRejectedValue(
                new Error(
                    'Unauthorized: Hanya role berikut yang dapat membuat purchase request: ADMIN, PROCUREMENT, PLANNING, WAREHOUSE, PRODUCTION',
                ),
            );

            const result = await createManualPurchaseRequest(validInput);
            expect(result.success).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // approvePurchaseRequest
    // ──────────────────────────────────────────────
    describe('approvePurchaseRequest', () => {
        it('rejects when no session (guard before DB)', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('No session'),
            );

            const result = await approvePurchaseRequest('pr-1');
            expect(result.success).toBe(false);
            expect(result.success === false && result.error).toContain(
                'No session',
            );
            expect(
                mockPurchaseService.approveRequest,
            ).not.toHaveBeenCalled();
        });

        it('rejects non-approver role (e.g. PLANNING)', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized: Hanya admin atau procurement'),
            );

            const result = await approvePurchaseRequest('pr-1');
            expect(result.success).toBe(false);
        });

        it('passes actorRole=ADMIN for ADMIN primary role', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.approveRequest.mockResolvedValue({
                id: 'pr-1',
                status: 'APPROVED',
            });

            const result = await approvePurchaseRequest('pr-1');
            expect(result.success).toBe(true);
            expect(
                mockPurchaseService.approveRequest,
            ).toHaveBeenCalledWith('pr-1', 'u-admin', 'ADMIN');
        });

        it('passes actorRole=PROCUREMENT for multi-role session where ADMIN not primary', async () => {
            const s = session('u-multi', 'PROCUREMENT', [
                'PROCUREMENT',
                'WAREHOUSE',
            ]);
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.approveRequest.mockResolvedValue({
                id: 'pr-2',
                status: 'APPROVED',
            });

            const result = await approvePurchaseRequest('pr-2');
            expect(result.success).toBe(true);
            expect(
                mockPurchaseService.approveRequest,
            ).toHaveBeenCalledWith('pr-2', 'u-multi', 'PROCUREMENT');
        });

        it('passes actorRole=ADMIN when ADMIN in roles (not primary)', async () => {
            const s = session('u-multi-admin', 'PROCUREMENT', [
                'PROCUREMENT',
                'ADMIN',
            ]);
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.approveRequest.mockResolvedValue({
                id: 'pr-3',
                status: 'APPROVED',
            });

            const result = await approvePurchaseRequest('pr-3');
            expect(result.success).toBe(true);
            // When ADMIN in roles array → actorRole = 'ADMIN'
            expect(
                mockPurchaseService.approveRequest,
            ).toHaveBeenCalledWith('pr-3', 'u-multi-admin', 'ADMIN');
        });

        it('delegates self-approval error from service', async () => {
            const s = session('u-proc', 'PROCUREMENT');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.approveRequest.mockRejectedValue(
                new Error(
                    'PROCUREMENT tidak boleh menyetujui request yang dibuat sendiri',
                ),
            );

            const result = await approvePurchaseRequest('pr-1');
            expect(result.success).toBe(false);
            expect(result.success === false && result.error).toContain(
                'tidak boleh menyetujui',
            );
        });

        it('revalidates /purchasing/requests on success', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.approveRequest.mockResolvedValue({
                id: 'pr-1',
                status: 'APPROVED',
            });

            const result = await approvePurchaseRequest('pr-1');
            expect(result.success).toBe(true);
            const { revalidatePath } = await import('next/cache');
            expect(revalidatePath).toHaveBeenCalledWith(
                '/purchasing/requests',
            );
        });
    });

    // ──────────────────────────────────────────────
    // rejectPurchaseRequest
    // ──────────────────────────────────────────────
    describe('rejectPurchaseRequest', () => {
        it('rejects when no session (guard before DB)', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('No session'),
            );

            const result = await rejectPurchaseRequest('pr-1', 'not needed');
            expect(result.success).toBe(false);
            expect(
                mockPurchaseService.rejectRequest,
            ).not.toHaveBeenCalled();
        });

        it('rejects non-approver role', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized'),
            );

            const result = await rejectPurchaseRequest('pr-1', 'reason');
            expect(result.success).toBe(false);
        });

        it('passes actorRole=ADMIN for ADMIN session', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.rejectRequest.mockResolvedValue({
                id: 'pr-1',
                status: 'REJECTED',
            });

            const result = await rejectPurchaseRequest(
                'pr-1',
                'Barang tidak diperlukan',
            );
            expect(result.success).toBe(true);
            expect(
                mockPurchaseService.rejectRequest,
            ).toHaveBeenCalledWith(
                'pr-1',
                'u-admin',
                'ADMIN',
                'Barang tidak diperlukan',
            );
        });

        it('forwards reason string to service', async () => {
            const s = session('u-proc', 'PROCUREMENT');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.rejectRequest.mockResolvedValue({
                id: 'pr-1',
                status: 'REJECTED',
            });

            await rejectPurchaseRequest('pr-1', 'Stok masih cukup');
            expect(
                mockPurchaseService.rejectRequest,
            ).toHaveBeenCalledWith(
                'pr-1',
                'u-proc',
                'PROCUREMENT',
                'Stok masih cukup',
            );
        });

        it('delegates validation error for empty reason from service', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.rejectRequest.mockRejectedValue(
                new Error(
                    'Alasan penolakan wajib diisi dan tidak boleh kosong',
                ),
            );

            const result = await rejectPurchaseRequest('pr-1', '');
            expect(result.success).toBe(false);
            expect(result.success === false && result.error).toContain(
                'wajib diisi',
            );
        });

        it('revalidates /purchasing/requests on success', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.rejectRequest.mockResolvedValue({
                id: 'pr-1',
                status: 'REJECTED',
            });

            const result = await rejectPurchaseRequest('pr-1', 'reason');
            expect(result.success).toBe(true);
            const { revalidatePath } = await import('next/cache');
            expect(revalidatePath).toHaveBeenCalledWith(
                '/purchasing/requests',
            );
        });
    });

    // ──────────────────────────────────────────────
    // getPurchaseRequests
    // ──────────────────────────────────────────────
    describe('getPurchaseRequests', () => {
        it('rejects when no session', async () => {
            mockRequireAuth.mockRejectedValue(new Error('No session'));

            const result = await getPurchaseRequests();
            expect(result.success).toBe(false);
        });

        it('ADMIN sees all requests (no ownership filter)', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-admin', 'ADMIN'),
            );
            mockPrisma.purchaseRequest.findMany.mockResolvedValue([
                { id: 'pr-1' },
                { id: 'pr-2' },
            ]);

            const result = await getPurchaseRequests();
            expect(result.success).toBe(true);
            const callArgs =
                mockPrisma.purchaseRequest.findMany.mock.calls[0][0];
            expect(callArgs.where).toEqual({});
        });

        it('PROCUREMENT sees all requests', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-proc', 'PROCUREMENT'),
            );
            mockPrisma.purchaseRequest.findMany.mockResolvedValue([
                { id: 'pr-1' },
            ]);

            const result = await getPurchaseRequests();
            expect(result.success).toBe(true);
            const callArgs =
                mockPrisma.purchaseRequest.findMany.mock.calls[0][0];
            expect(callArgs.where).toEqual({});
        });

        it('PLANNING only sees own requests (createdById filter)', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-plan', 'PLANNING'),
            );
            mockPrisma.purchaseRequest.findMany.mockResolvedValue([]);

            await getPurchaseRequests();
            const callArgs =
                mockPrisma.purchaseRequest.findMany.mock.calls[0][0];
            expect(callArgs.where).toEqual({
                createdById: 'u-plan',
            });
        });

        it('WAREHOUSE only sees own requests', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-wh', 'WAREHOUSE'),
            );
            mockPrisma.purchaseRequest.findMany.mockResolvedValue([]);

            await getPurchaseRequests();
            const callArgs =
                mockPrisma.purchaseRequest.findMany.mock.calls[0][0];
            expect(callArgs.where).toEqual({
                createdById: 'u-wh',
            });
        });

        it('PRODUCTION only sees own requests', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-prod', 'PRODUCTION'),
            );
            mockPrisma.purchaseRequest.findMany.mockResolvedValue([]);

            await getPurchaseRequests();
            const callArgs =
                mockPrisma.purchaseRequest.findMany.mock.calls[0][0];
            expect(callArgs.where).toEqual({
                createdById: 'u-prod',
            });
        });

        it('FINANCE is rejected (no access)', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-fin', 'FINANCE'),
            );

            const result = await getPurchaseRequests();
            expect(result.success).toBe(false);
            expect(result.success === false && result.error).toContain(
                'Tidak memiliki akses',
            );
        });

        it('status filter is combined with ownership where (not overwritten)', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-plan', 'PLANNING'),
            );
            mockPrisma.purchaseRequest.findMany.mockResolvedValue([]);

            await getPurchaseRequests({ status: 'OPEN' });
            const callArgs =
                mockPrisma.purchaseRequest.findMany.mock.calls[0][0];
            expect(callArgs.where).toEqual({
                createdById: 'u-plan',
                status: 'OPEN',
            });
        });

        it('ADMIN with status filter has no ownership key', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-admin', 'ADMIN'),
            );
            mockPrisma.purchaseRequest.findMany.mockResolvedValue([]);

            await getPurchaseRequests({ status: 'APPROVED' });
            const callArgs =
                mockPrisma.purchaseRequest.findMany.mock.calls[0][0];
            expect(callArgs.where).toEqual({ status: 'APPROVED' });
        });

        it('includes reviewedBy {id, name} in query', async () => {
            mockRequireAuth.mockResolvedValue(
                session('u-admin', 'ADMIN'),
            );
            mockPrisma.purchaseRequest.findMany.mockResolvedValue([]);

            await getPurchaseRequests();
            const callArgs =
                mockPrisma.purchaseRequest.findMany.mock.calls[0][0];
            expect(callArgs.include.reviewedBy).toEqual({
                select: { id: true, name: true },
            });
        });
    });

    // ──────────────────────────────────────────────
    // consolidatePurchaseRequests
    // ──────────────────────────────────────────────
    describe('consolidatePurchaseRequests', () => {
        it('rejects when no session (guard before DB)', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('No session'),
            );

            const result = await consolidatePurchaseRequests(
                ['pr-1'],
                'supplier-1',
            );
            expect(result.success).toBe(false);
            expect(
                mockPurchaseService.consolidateRequestsToOrder,
            ).not.toHaveBeenCalled();
        });

        it('rejects non-approver (e.g. PLANNING)', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized'),
            );

            const result = await consolidatePurchaseRequests(
                ['pr-1'],
                'supplier-1',
            );
            expect(result.success).toBe(false);
        });

        it('allows ADMIN and calls service', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.consolidateRequestsToOrder.mockResolvedValue({
                id: 'po-1',
                orderNumber: 'PO-2026-0001',
            });

            const result = await consolidatePurchaseRequests(
                ['pr-1', 'pr-2'],
                'supplier-1',
            );
            expect(result.success).toBe(true);
            expect(
                mockPurchaseService.consolidateRequestsToOrder,
            ).toHaveBeenCalledWith(
                ['pr-1', 'pr-2'],
                'supplier-1',
                'u-admin',
            );
        });

        it('allows PROCUREMENT and calls service', async () => {
            const s = session('u-proc', 'PROCUREMENT');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.consolidateRequestsToOrder.mockResolvedValue({
                id: 'po-2',
                orderNumber: 'PO-2026-0002',
            });

            const result = await consolidatePurchaseRequests(
                ['pr-3'],
                'supplier-2',
            );
            expect(result.success).toBe(true);
        });

        it('revalidates /purchasing/requests and /purchasing/orders', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.consolidateRequestsToOrder.mockResolvedValue({
                id: 'po-1',
                orderNumber: 'PO-2026-0001',
            });

            await consolidatePurchaseRequests(['pr-1'], 'supplier-1');
            const { revalidatePath } = await import('next/cache');
            expect(revalidatePath).toHaveBeenCalledWith(
                '/purchasing/requests',
            );
            expect(revalidatePath).toHaveBeenCalledWith(
                '/purchasing/orders',
            );
        });

        it('delegates service error', async () => {
            const s = session('u-admin', 'ADMIN');
            mockRequirePurchasingApprover.mockResolvedValue(s);
            mockPurchaseService.consolidateRequestsToOrder.mockRejectedValue(
                new Error('Request pr-1 sudah berubah status'),
            );

            const result = await consolidatePurchaseRequests(
                ['pr-1'],
                'supplier-1',
            );
            expect(result.success).toBe(false);
            expect(result.success === false && result.error).toContain(
                'sudah berubah status',
            );
        });
    });
});
