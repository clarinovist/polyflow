import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    trackMobileTaskEvent,
    trackTaskStarted,
    trackTaskCompleted,
    trackTaskFailed,
} from '../mobile-task-events';

// Mock fetch
const mockFetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
);

beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
});

describe('mobile-task-events', () => {
    it('trackMobileTaskEvent sends correct payload', async () => {
        await trackMobileTaskEvent(
            'MOBILE_TASK_STARTED',
            '/field/sales',
            { portalId: 'sales-field', taskType: 'visit' },
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body.pathname).toBe('/field/sales');
        expect(body.eventType).toBe('MOBILE_TASK_STARTED');
        expect(body.source).toBe('MOBILE_WEB');
        expect(body.metadata.eventType).toBeUndefined();
        expect(body.metadata.source).toBeUndefined();
        expect(body.metadata.portalId).toBe('sales-field');
        expect(body.metadata.taskType).toBe('visit');
    });

    it('sanitizes metadata to portalId/taskType/outcome/duration only', async () => {
        await trackMobileTaskEvent(
            'MOBILE_TASK_COMPLETED',
            '/test',
            {
                portalId: 'test',
                taskType: 'test',
                outcome: 'SUCCESS',
                duration: 12,
                email: 'private@example.test',
            } as never,
        );

        // Verify sanitization works by checking only allowed fields are present
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body.metadata.portalId).toBe('test');
        expect(body.metadata.taskType).toBe('test');
        expect(body.metadata.outcome).toBe('SUCCESS');
        expect(body.metadata.duration).toBe(12);
        expect(Object.keys(body.metadata).sort()).toEqual([
            'duration',
            'outcome',
            'portalId',
            'taskType',
        ]);
        expect(body.metadata.email).toBeUndefined();
        expect(body.metadata.phone).toBeUndefined();
        expect(body.metadata.sensitiveData).toBeUndefined();
    });

    it('trackTaskStarted sends only the static safe task metadata', async () => {
        await trackTaskStarted('/field/sales', 'sales-field', 'visit');
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body).toMatchObject({
            pathname: '/field/sales',
            eventType: 'MOBILE_TASK_STARTED',
            source: 'MOBILE_WEB',
            metadata: { portalId: 'sales-field', taskType: 'visit' },
        });
        expect(Object.keys(body.metadata).sort()).toEqual([
            'portalId',
            'taskType',
        ]);
    });

    it('trackTaskCompleted includes allowlisted duration', async () => {
        await trackTaskCompleted('/test', 'test', 'order', 5000);
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body.eventType).toBe('MOBILE_TASK_COMPLETED');
        expect(body.metadata.duration).toBe(5000);
        expect(body.metadata.outcome).toBe('SUCCESS');
        expect(body.metadata.durationMs).toBeUndefined();
        expect(body.metadata.resultCategory).toBeUndefined();
    });

    it('trackTaskFailed includes errorCategory', async () => {
        await trackTaskFailed('/test', 'test', 'visit', 'network');
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body.eventType).toBe('MOBILE_TASK_FAILED');
        expect(body.metadata.outcome).toBe('network');
    });

    it('does not throw on fetch failure', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        await expect(
            trackTaskStarted('/test', 'test', 'test'),
        ).resolves.not.toThrow();
    });
});
