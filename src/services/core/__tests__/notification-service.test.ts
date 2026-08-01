import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../notification-service';

const mockFindMany = vi.fn();
const mockCreateMany = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    get prisma() {
        return {
            notification: {
                findMany: mockFindMany,
                createMany: mockCreateMany,
                create: vi.fn().mockResolvedValue({ id: 'n1' }),
                update: vi.fn().mockResolvedValue({}),
                updateMany: vi.fn().mockResolvedValue({}),
                count: vi.fn().mockResolvedValue(0),
            },
            user: { findUnique: vi.fn().mockResolvedValue(null) },
        };
    },
}));

vi.mock('resend', () => ({
    Resend: class {
        emails = { send: vi.fn().mockResolvedValue({}) };
    },
}));

describe('NotificationService.createBulkNotificationsThrottled', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns count 0 and skips query for empty inputs', async () => {
        const result = await NotificationService.createBulkNotificationsThrottled(
            [],
        );
        expect(result).toEqual({ count: 0 });
        expect(mockFindMany).not.toHaveBeenCalled();
        expect(mockCreateMany).not.toHaveBeenCalled();
    });

    it('skips all inputs when matching notifications exist within 24h', async () => {
        mockFindMany.mockResolvedValue([
            { userId: 'u1', entityId: 'e1' },
            { userId: 'u2', entityId: 'e2' },
        ]);
        mockCreateMany.mockResolvedValue({ count: 0 });

        const result = await NotificationService.createBulkNotificationsThrottled([
            {
                userId: 'u1',
                type: 'LOW_STOCK',
                title: 'Low Stock',
                message: 'msg',
                entityId: 'e1',
            },
            {
                userId: 'u2',
                type: 'LOW_STOCK',
                title: 'Low Stock',
                message: 'msg',
                entityId: 'e2',
            },
        ]);

        expect(result).toEqual({ count: 0 });
        expect(mockFindMany).toHaveBeenCalledTimes(1);
        expect(mockCreateMany).not.toHaveBeenCalled();
    });

    it('creates only non-matching inputs (partial filter)', async () => {
        mockFindMany.mockResolvedValue([
            { userId: 'u1', entityId: 'e1' },
        ]);
        mockCreateMany.mockResolvedValue({ count: 1 });

        const result = await NotificationService.createBulkNotificationsThrottled([
            {
                userId: 'u1',
                type: 'LOW_STOCK',
                title: 'Low Stock',
                message: 'msg',
                entityId: 'e1',
            },
            {
                userId: 'u2',
                type: 'LOW_STOCK',
                title: 'Low Stock',
                message: 'msg',
                entityId: 'e2',
            },
        ]);

        expect(result).toEqual({ count: 1 });
        expect(mockCreateMany).toHaveBeenCalledWith({
            data: [
                {
                    userId: 'u2',
                    type: 'LOW_STOCK',
                    title: 'Low Stock',
                    message: 'msg',
                    entityId: 'e2',
                },
            ],
        });
    });

    it('creates all inputs when no matching notifications exist', async () => {
        mockFindMany.mockResolvedValue([]);
        mockCreateMany.mockResolvedValue({ count: 2 });

        const result = await NotificationService.createBulkNotificationsThrottled([
            {
                userId: 'u1',
                type: 'OVERDUE_AP',
                title: 'Overdue',
                message: 'msg',
                entityId: 'e1',
            },
            {
                userId: 'u2',
                type: 'OVERDUE_AP',
                title: 'Overdue',
                message: 'msg',
                entityId: 'e2',
            },
        ]);

        expect(result).toEqual({ count: 2 });
        expect(mockCreateMany).toHaveBeenCalledTimes(1);
    });

    it('respects custom withinHours parameter', async () => {
        mockFindMany.mockResolvedValue([]);
        mockCreateMany.mockResolvedValue({ count: 1 });

        await NotificationService.createBulkNotificationsThrottled(
            [
                {
                    userId: 'u1',
                    type: 'LOW_STOCK',
                    title: 'Low Stock',
                    message: 'msg',
                    entityId: 'e1',
                },
            ],
            12,
        );

        const where = mockFindMany.mock.calls[0][0].where;
        expect(where.createdAt.gte).toBeInstanceOf(Date);

        const cutoff = where.createdAt.gte as Date;
        const expected = new Date(Date.now() - 12 * 3600_000);
        expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(
            1000,
        );
    });
});
