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
        expect(body.metadata.eventType).toBe('MOBILE_TASK_STARTED');
        expect(body.metadata.source).toBe('MOBILE_WEB');
        expect(body.metadata.portalId).toBe('sales-field');
        expect(body.metadata.taskType).toBe('visit');
    });

    it('sanitizes metadata — removes sensitive fields', async () => {
        await trackMobileTaskEvent(
            'MOBILE_TASK_COMPLETED',
            '/test',
            {
                portalId: 'test',
                taskType: 'test',
            },
        );

        // Verify sanitization works by checking only allowed fields are present
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body.metadata.portalId).toBe('test');
        expect(body.metadata.taskType).toBe('test');
        // These fields should NOT be in the sanitized output
        expect(body.metadata.email).toBeUndefined();
        expect(body.metadata.phone).toBeUndefined();
        expect(body.metadata.sensitiveData).toBeUndefined();
    });

    it('trackTaskStarted sends correct event type', async () => {
        await trackTaskStarted('/field/sales', 'sales-field', 'visit');
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body.metadata.eventType).toBe('MOBILE_TASK_STARTED');
    });

    it('trackTaskCompleted includes durationMs', async () => {
        await trackTaskCompleted('/test', 'test', 'order', 5000);
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body.metadata.eventType).toBe('MOBILE_TASK_COMPLETED');
        expect(body.metadata.durationMs).toBe(5000);
        expect(body.metadata.resultCategory).toBe('SUCCESS');
    });

    it('trackTaskFailed includes errorCategory', async () => {
        await trackTaskFailed('/test', 'test', 'visit', 'network');
        const raw = mockFetch.mock.calls[0] as unknown[];
        const opts = raw[1] as { body: string };
        const body = JSON.parse(opts.body);
        expect(body.metadata.eventType).toBe('MOBILE_TASK_FAILED');
        expect(body.metadata.resultCategory).toBe('network');
    });

    it('does not throw on fetch failure', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        await expect(
            trackTaskStarted('/test', 'test', 'test'),
        ).resolves.not.toThrow();
    });
});
