import { describe, expect, it } from 'vitest';
import { getFindingsMode } from '../findings-mode';

describe('getFindingsMode', () => {
    it('defaults to off when nothing is configured', () => {
        expect(getFindingsMode('tenant-a', {})).toBe('off');
    });

    it('returns observe for a listed subdomain, ignoring case and spaces', () => {
        const env = { FINDINGS_OBSERVE_TENANTS: ' Tenant-A , tenant-b ' };
        expect(getFindingsMode('tenant-a', env)).toBe('observe');
        expect(getFindingsMode('TENANT-B', env)).toBe('observe');
        expect(getFindingsMode('tenant-c', env)).toBe('off');
    });

    it('returns notify for a subdomain only in the notify list', () => {
        const env = { FINDINGS_NOTIFY_TENANTS: 'tenant-a' };
        expect(getFindingsMode('tenant-a', env)).toBe('notify');
    });

    it('prefers observe when a subdomain is in both lists', () => {
        const env = {
            FINDINGS_OBSERVE_TENANTS: 'tenant-a',
            FINDINGS_NOTIFY_TENANTS: 'tenant-a',
        };
        expect(getFindingsMode('tenant-a', env)).toBe('observe');
    });

    it('never matches an empty subdomain or empty list entries', () => {
        const env = { FINDINGS_OBSERVE_TENANTS: ',,' };
        expect(getFindingsMode('', env)).toBe('off');
        expect(getFindingsMode('tenant-a', env)).toBe('off');
    });
});
