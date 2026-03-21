import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';

// Mock next/server for this specific test to support `new NextResponse()`
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
            return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
        }
        static json(body: any, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }
    return { NextResponse: MockNextResponse, NextRequest: class {} };
});
// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        auditLog: {
            deleteMany: vi.fn().mockResolvedValue({ count: 5 })
        },
        notification: {
            deleteMany: vi.fn().mockResolvedValue({ count: 10 })
        }
    }
}));

// Mock services that are dynamically imported
vi.mock('@/services/inventory-service', () => ({
    InventoryService: {
        checkLowStockTriggers: vi.fn().mockResolvedValue(undefined)
    }
}));
vi.mock('@/services/purchasing/invoices-service', () => ({
    checkOverduePurchasingInvoices: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@/services/invoice-service', () => ({
    InvoiceService: {
        checkOverdueSalesInvoices: vi.fn().mockResolvedValue(undefined)
    }
}));

describe('Cleanup Cron Route', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...ORIGINAL_ENV };
        process.env.CRON_SECRET = 'test-secret';
    });

    it('should return 401 if CRON_SECRET is set but authorization header is missing', async () => {
        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET'
        });

        const response = await GET(req);
        expect(response.status).toBe(401);
        const body = await response.text();
        expect(body).toBe('Unauthorized');
    });

    it('should return 401 if authorization header is incorrect', async () => {
        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
            headers: {
                'authorization': 'Bearer wrong-secret'
            }
        });

        const response = await GET(req);
        expect(response.status).toBe(401);
    });

    it('should return 200 and execute cleanup if authorization header is correct', async () => {
        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET',
            headers: {
                'authorization': 'Bearer test-secret'
            }
        });

        const response = await GET(req);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.deletedRecords.auditLogs).toBe(5);
        expect(data.deletedRecords.notifications).toBe(10);
    });

    it('should proceed if CRON_SECRET is not set', async () => {
        delete process.env.CRON_SECRET;
        const req = new Request('http://localhost/api/cron/cleanup', {
            method: 'GET'
        });

        const response = await GET(req);
        expect(response.status).toBe(200);
    });
});
