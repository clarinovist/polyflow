import { describe, expect, it } from 'vitest';
import { parseChatRequestBody } from '../chat-request';

describe('parseChatRequestBody', () => {
    it('normalizes question and accepts a minimal work-context hint', () => {
        expect(
            parseChatRequestBody({
                question: '  cek invoice ini  ',
                conversationId: 'conv-1',
                workContext: { pathname: '/finance/invoices/sales/inv-1' },
            }),
        ).toEqual({
            success: true,
            data: {
                question: 'cek invoice ini',
                conversationId: 'conv-1',
                workContext: { pathname: '/finance/invoices/sales/inv-1' },
            },
        });
    });

    it('rejects unexpected authority fields in work context', () => {
        const result = parseChatRequestBody({
            question: 'cek invoice',
            workContext: {
                pathname: '/finance',
                tenantId: 'forged',
                allowedResources: 'ALL',
            },
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.workContext).toEqual({ pathname: '/finance' });
        }
    });

    it('rejects empty and oversized questions', () => {
        expect(parseChatRequestBody({ question: '  ' })).toEqual({
            success: false,
            error: 'Question is required.',
        });
        expect(parseChatRequestBody({ question: 'x'.repeat(2001) })).toEqual({
            success: false,
            error: 'Question is too long. Maximum 2000 characters allowed.',
        });
    });

    it('rejects malformed context rather than accepting an arbitrary object', () => {
        expect(
            parseChatRequestBody({
                question: 'cek produksi',
                workContext: { pathname: 42 },
            }),
        ).toEqual({ success: false, error: 'Request context is invalid.' });
    });
});
