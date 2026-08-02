import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';

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

vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        checkLowStockTriggers: vi.fn().mockResolvedValue(undefined),
    },
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
