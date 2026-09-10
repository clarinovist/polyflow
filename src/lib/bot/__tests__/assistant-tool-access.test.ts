import { describe, expect, it } from 'vitest';
import {
    findAllowedAssistantTool,
    getAvailableAssistantTools,
} from '../assistant-tool-access';
import type { AssistantUserContext } from '../assistant-types';

const context: AssistantUserContext = {
    userId: 'finance-user',
    roles: ['FINANCE'],
    allowedResources: ['/finance'],
    tenantId: 'tenant-1',
    channel: 'web',
    locale: 'id-ID',
};

describe('assistant tool execution allowlist', () => {
    it('exposes business tools only after current permissions are verified', () => {
        const verified = getAvailableAssistantTools(context, true);
        const unverified = getAvailableAssistantTools(context, false);

        expect(verified.map((tool) => tool.name)).toContain(
            'get_finance_reconciliation',
        );
        expect(unverified.map((tool) => tool.name)).toEqual([
            'search_help_articles',
        ]);
    });

    it('fails closed without identity and rejects a registry tool not offered in the request', () => {
        expect(getAvailableAssistantTools(undefined, true)).toEqual([]);
        const offered = getAvailableAssistantTools(context, false);
        expect(
            findAllowedAssistantTool(offered, 'get_finance_reconciliation'),
        ).toBeUndefined();
        expect(
            findAllowedAssistantTool(offered, 'search_help_articles')?.name,
        ).toBe('search_help_articles');
    });
});
