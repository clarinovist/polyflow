import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { hasTenantModule } from '@/lib/modules/tenant-entitlements';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { checkOverduePurchasingInvoices } from '@/services/purchasing/invoices-service';
import { InvoiceService } from '@/services/finance/invoice-service';
import { dispatchReminders } from '@/lib/hrd/employment-reminder';
import { autoExpireQuotations } from '@/services/sales/quotation-service';
import { autoCloseExpiredDeliverySchedules } from '@/services/sales/delivery-schedule-auto-close';
import { autoExpireReservations } from '@/services/inventory/reservation-service';

vi.mock('next/server', () => {
    class MockNextResponse {
        status: number;
        _body: any;
        constructor(body?: any, init?: { status?: number }) {
            this._body = body;
            this.status = init?.status || 200;
        }
        async text() {
            return String(this._body);
        }
        async json() {
            return typeof this._body === 'string'
                ? JSON.parse(this._body)
                : this._body;
        }
        static json(body: any, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }
    return { NextResponse: MockNextResponse, NextRequest: class {} };
});

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({
        usageEvent: {
            deleteMany: vi.fn().mockResolvedValue({ count: 15 }),
        },
    }),
    prisma: {
        auditLog: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
        notification: {
            deleteMany: vi.fn().mockResolvedValue({ count: 10 }),
        },
    },
}));

const mockRunForEachActiveTenant = vi.fn();
vi.mock('@/lib/core/tenant-loop', () => ({
    runForEachActiveTenant: (...args: any[]) =>
        mockRunForEachActiveTenant(...args),
}));

vi.mock('@/lib/modules/tenant-entitlements', () => ({
    hasTenantModule: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        checkLowStockTriggers: vi.fn().mockResolvedValue(undefined),
    },
}));
vi.mock('@/services/inventory/reservation-service', () => ({
    autoExpireReservations: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/services/purchasing/invoices-service', () => ({
    checkOverduePurchasingInvoices: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/finance/invoice-service', () => ({
    InvoiceService: {
        checkOverdueSalesInvoices: vi.fn().mockResolvedValue(undefined),
    },
}));
vi.mock('@/lib/hrd/employment-reminder', () => ({
    dispatchReminders: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/sales/quotation-service', () => ({
    autoExpireQuotations: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/services/sales/delivery-schedule-auto-close', () => ({
    autoCloseExpiredDeliverySchedules: vi.fn().mockResolvedValue({
        scanned: 0,
        closed: [],
        cancelledTrips: 0,
        cancelledStops: 0,
    }),
}));

describe('Cleanup Cron Route', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...ORIGINAL_ENV };
        process.env.CRON_SECRET = 'test-secret';
        mockRunForEachActiveTenant.mockReset();
        vi.mocked(hasTenantModule).mockReset().mockResolvedValue(true);
        vi.mocked(InventoryCoreService.checkLowStockTriggers).mockClear();
        vi.mocked(checkOverduePurchasingInvoices).mockClear();
        vi.mocked(InvoiceService.checkOverdueSalesInvoices).mockClear();
        vi.mocked(dispatchReminders).mockClear();
        vi.mocked(autoExpireQuotations).mockClear();
        vi.mocked(autoCloseExpiredDeliverySchedules).mockClear();
        vi.mocked(autoExpireReservations).mockClear();
    });

    it('should return 401 if authorization header is missing', async () => {
        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
        });
        const response = await GET(req);
        expect(response.status).toBe(401);
        const body = await response.text();
        expect(body).toBe('Unauthorized');
    });

    it('should return 401 if authorization header is incorrect', async () => {
        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
            headers: { authorization: 'Bearer wrong-secret' },
        });
        const response = await GET(req);
        expect(response.status).toBe(401);
    });

    it('should return 401 if CRON_SECRET is not set', async () => {
        delete process.env.CRON_SECRET;
        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
        });
        const response = await GET(req);
        expect(response.status).toBe(401);
        const body = await response.text();
        expect(body).toBe('Unauthorized');
    });

    it('should return 200 with new response shape', async () => {
        mockRunForEachActiveTenant.mockResolvedValue([
            {
                tenant: 'kiyowo',
                result: {
                    auditLogs: 5,
                    notifications: 10,
                    expiredQuotations: 0,
                    autoClosedSchedules: null,
                },
            },
        ]);

        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
            headers: { authorization: 'Bearer test-secret' },
        });
        const response = await GET(req);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.usageEventCleanup).toEqual({ count: 15 });
        expect(data.perTenant).toHaveLength(1);
        expect(data.perTenant[0].tenant).toBe('kiyowo');
        expect(data.perTenant[0].result.auditLogs).toBe(5);
        expect(data.executedAt).toBeDefined();
    });

    it('skips non-entitled subsystems and calls entitled ones', async () => {
        mockRunForEachActiveTenant.mockImplementation(
            async (fn: (tenant: { id: string; subdomain: string }) => unknown) =>
                [
                    {
                        tenant: 'acme',
                        result: await fn({
                            id: 'tenant-1',
                            subdomain: 'acme',
                        }),
                    },
                ],
        );
        vi.mocked(hasTenantModule).mockImplementation(
            async (moduleKey: string) => moduleKey !== 'HRD',
        );

        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
            headers: { authorization: 'Bearer test-secret' },
        });
        const response = await GET(req);
        expect(response.status).toBe(200);

        expect(InventoryCoreService.checkLowStockTriggers).toHaveBeenCalled();
        expect(checkOverduePurchasingInvoices).toHaveBeenCalled();
        expect(InvoiceService.checkOverdueSalesInvoices).toHaveBeenCalled();
        expect(autoExpireQuotations).toHaveBeenCalled();
        expect(autoCloseExpiredDeliverySchedules).toHaveBeenCalled();
        expect(autoExpireReservations).toHaveBeenCalled();
        expect(dispatchReminders).not.toHaveBeenCalled();

        const data = await response.json();
        expect(data.entitlementSkips).toBe(1);
    });

    it('skips reservation auto-expire when INVENTORY module is not entitled', async () => {
        mockRunForEachActiveTenant.mockImplementation(
            async (fn: (tenant: { id: string; subdomain: string }) => unknown) =>
                [
                    {
                        tenant: 'acme',
                        result: await fn({
                            id: 'tenant-1',
                            subdomain: 'acme',
                        }),
                    },
                ],
        );
        vi.mocked(hasTenantModule).mockImplementation(
            async (moduleKey: string) => moduleKey !== 'INVENTORY',
        );

        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
            headers: { authorization: 'Bearer test-secret' },
        });
        const response = await GET(req);
        expect(response.status).toBe(200);

        expect(autoExpireReservations).not.toHaveBeenCalled();

        const data = await response.json();
        // INVENTORY is checked twice per tenant (low-stock triggers + reservation expire)
        expect(data.entitlementSkips).toBe(2);
    });

    it('continues cleanup for a tenant even when reservation auto-expire throws', async () => {
        mockRunForEachActiveTenant.mockImplementation(
            async (fn: (tenant: { id: string; subdomain: string }) => unknown) =>
                [
                    {
                        tenant: 'acme',
                        result: await fn({
                            id: 'tenant-1',
                            subdomain: 'acme',
                        }),
                    },
                ],
        );
        vi.mocked(autoExpireReservations).mockRejectedValue(new Error('DB down'));

        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
            headers: { authorization: 'Bearer test-secret' },
        });
        const response = await GET(req);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(autoCloseExpiredDeliverySchedules).toHaveBeenCalled();
    });

    it('should return partial success when one tenant errors', async () => {
        mockRunForEachActiveTenant.mockResolvedValue([
            {
                tenant: 'kiyowo',
                result: {
                    auditLogs: 5,
                    notifications: 10,
                    expiredQuotations: 0,
                    autoClosedSchedules: null,
                },
            },
            {
                tenant: 'melindo',
                error: 'Tenant DB connection failed',
            },
        ]);

        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
            headers: { authorization: 'Bearer test-secret' },
        });
        const response = await GET(req);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.perTenant).toHaveLength(2);
        expect(data.perTenant[1].error).toBe('Tenant DB connection failed');
    });
});
