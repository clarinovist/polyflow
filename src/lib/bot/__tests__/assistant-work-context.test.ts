import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    resolveAssistantWorkContext,
    workContextKey,
} from '../assistant-work-context';
import type { AssistantUserContext } from '../assistant-types';

const base: AssistantUserContext = {
    userId: 'user-1',
    roles: ['FINANCE'],
    allowedResources: ['/finance'],
    tenantId: 'tenant-1',
    channel: 'web',
    locale: 'id-ID',
};

describe('resolveAssistantWorkContext', () => {
    const previousFlag = process.env.ASSISTANT_CONTEXTUAL_PROFILES;

    beforeEach(() => {
        process.env.ASSISTANT_CONTEXTUAL_PROFILES = 'true';
    });

    afterEach(() => {
        if (previousFlag === undefined) {
            delete process.env.ASSISTANT_CONTEXTUAL_PROFILES;
        } else {
            process.env.ASSISTANT_CONTEXTUAL_PROFILES = previousFlag;
        }
    });

    it('resolves a permitted finance invoice detail without trusting extra URL data', () => {
        const result = resolveAssistantWorkContext(
            {
                pathname:
                    '/finance/invoices/sales/invoice_123?tenantId=other&token=secret',
            },
            base,
        );

        expect(result).toEqual({
            profile: 'finance',
            pathname: '/finance/invoices/sales/invoice_123',
            entity: { type: 'invoice', id: 'invoice_123' },
        });
    });

    it('resolves a permitted production order detail', () => {
        const result = resolveAssistantWorkContext(
            { pathname: '/production/orders/order-7' },
            {
                ...base,
                roles: ['PRODUCTION'],
                allowedResources: ['/production/orders'],
            },
        );

        expect(result.profile).toBe('production');
        expect(result.entity).toEqual({
            type: 'production-order',
            id: 'order-7',
        });
    });

    it('does not treat a production create page as an existing order', () => {
        const result = resolveAssistantWorkContext(
            { pathname: '/production/orders/create' },
            {
                ...base,
                roles: ['PRODUCTION'],
                allowedResources: ['/production/orders'],
            },
        );
        expect(result.profile).toBe('production');
        expect(result.entity).toBeUndefined();
    });

    it('does not grant a finance profile from a forged path', () => {
        const result = resolveAssistantWorkContext(
            { pathname: '/finance/invoices/sales/invoice-1' },
            { ...base, allowedResources: ['/production/orders'] },
        );

        expect(result).toEqual({ profile: 'general', pathname: '/' });
    });

    it('drops malformed or unsafe entity ids while retaining permitted module context', () => {
        const malformed = resolveAssistantWorkContext(
            { pathname: '/finance/invoices/sales/%E0%A4%A' },
            base,
        );
        const slashed = resolveAssistantWorkContext(
            { pathname: '/finance/invoices/sales/invoice.123' },
            base,
        );

        expect(malformed.profile).toBe('finance');
        expect(malformed.entity).toBeUndefined();
        expect(slashed.entity).toBeUndefined();
    });

    it('falls back to general context when rollout flag is off', () => {
        process.env.ASSISTANT_CONTEXTUAL_PROFILES = 'false';
        expect(
            resolveAssistantWorkContext(
                { pathname: '/finance/invoices/sales/invoice-1' },
                base,
            ),
        ).toEqual({ profile: 'general', pathname: '/' });
    });

    it('returns general context for malformed input and creates stable keys', () => {
        const result = resolveAssistantWorkContext({ pathname: '' }, base);
        expect(result).toEqual({ profile: 'general', pathname: '/' });
        expect(
            workContextKey({
                profile: 'finance',
                pathname: '/finance/invoices/sales/i-1',
                entity: { type: 'invoice', id: 'i-1' },
            }),
        ).toBe('finance:/finance/invoices/sales/i-1:invoice:i-1');
    });
});
